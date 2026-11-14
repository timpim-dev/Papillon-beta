package xyz.getpapillon.wear

import android.content.Context
import android.graphics.Color
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.wrap
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.CompactChip
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class PapillonTileService : TileService() {

  override fun onTileRequest(
    requestParams: RequestBuilders.TileRequest
  ): ListenableFuture<TileBuilders.Tile> {
    val context: Context = applicationContext
    val snapshot = WearRepository.loadCached(context)
    val prefs = WearRepository.localPreferences.value
    val root = buildTileRoot(context, snapshot, prefs, requestParams.deviceConfiguration)

    val timeline = TimelineBuilders.Timeline.Builder()
      .addTimelineEntry(
        TimelineBuilders.TimelineEntry.Builder()
          .setLayout(
            LayoutElementBuilders.Layout.Builder()
              .setRoot(root)
              .build()
          )
          .build()
      )
      .build()

    val tile = TileBuilders.Tile.Builder()
      .setResourcesVersion("1")
      .setFreshnessIntervalMillis(5 * 60 * 1000L)
      .setTileTimeline(timeline)
      .build()

    return Futures.immediateFuture(tile)
  }

  override fun onTileResourcesRequest(
    requestParams: RequestBuilders.ResourcesRequest
  ): ListenableFuture<ResourceBuilders.Resources> {
    return Futures.immediateFuture(
      ResourceBuilders.Resources.Builder()
        .setVersion("1")
        .build()
    )
  }

  private fun buildTileRoot(
    context: Context,
    snapshot: WearSnapshot?,
    prefs: WearLocalPreferences,
    deviceParams: DeviceParameters
  ): LayoutElementBuilders.LayoutElement {
    val defaultAccent = Color.parseColor("#29947A")
    val syncGradient = snapshot?.effectiveSyncGradient(prefs) != false
    val accentInt = if (syncGradient) {
      WearFormatters.adjustColor(snapshot?.themeColor, 0.25f, defaultAccent)
    } else {
      defaultAccent
    }

    val launchClickable = ModifiersBuilders.Clickable.Builder()
      .setId("open_papillon_wear")
      .setOnClick(
        ActionBuilders.LaunchAction.Builder()
          .setAndroidActivity(
            ActionBuilders.AndroidActivity.Builder()
              .setPackageName(context.packageName)
              .setClassName(WearMainActivity::class.java.name)
              .build()
          )
          .build()
      )
      .build()

    val now = System.currentTimeMillis()
    val upcomingCourses = snapshot?.nextClasses
      ?.filter { !it.isCanceled && it.to > now }
      ?.sortedBy { it.from }
      ?: emptyList()
    val nextCourse = upcomingCourses.firstOrNull()
    val pendingTasks = snapshot?.tasks?.filter { !it.isDone }?.sortedBy { it.dueDate }.orEmpty()
    val grades = snapshot?.latestGrades.orEmpty()
    val avgText = snapshot?.overallAverage

    val preset = snapshot?.effectiveTilePreset(prefs) ?: prefs.tilePreset
    val contentColumn = LayoutElementBuilders.Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)

    val headerLabel: String
    when (preset) {
      "next_2_classes" -> {
        headerLabel = "Prochains cours"
        val twoCourses = upcomingCourses.take(2)
        if (twoCourses.isEmpty()) {
          contentColumn.addContent(
            buildTileCard(context, listOf(TileLine("Aucun cours à venir", Typography.TYPOGRAPHY_CAPTION1)), accentInt, launchClickable)
          )
        } else {
          twoCourses.forEachIndexed { idx, course ->
            if (idx > 0) addSpacer(contentColumn)
            val prefix = course.emoji?.let { "$it " } ?: ""
            val timeRange = formatCompactTimeRange(course.from, course.to)
            val room = course.room?.trim()?.takeIf { it.isNotEmpty() }
            val metaLine = if (room != null) "📍 $room • $timeRange" else timeRange
            val color = WearFormatters.adjustColor(course.color, 0.20f, accentInt)
            contentColumn.addContent(
              buildTileCard(
                context = context,
                lines = listOf(
                  TileLine("$prefix${course.subject}", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE),
                  TileLine(metaLine, Typography.TYPOGRAPHY_CAPTION2, Color.argb(225, 255, 255, 255))
                ),
                accentColor = color,
                clickable = launchClickable
              )
            )
          }
        }
      }

      "next_class_countdown" -> {
        headerLabel = "Prochain cours"
        if (nextCourse != null) {
          val countdown = WearFormatters.formatCountdown(nextCourse.from, nextCourse.to, now)
          val courseColor = WearFormatters.adjustColor(nextCourse.color, 0.20f, accentInt)
          val prefix = nextCourse.emoji?.let { "$it " } ?: ""
          val timeRange = WearFormatters.formatTimeRange(nextCourse.from, nextCourse.to)
          val room = nextCourse.room?.trim()?.takeIf { it.isNotEmpty() }
          contentColumn.addContent(
            buildTileCard(
              context = context,
              lines = listOf(TileLine(countdown.ifEmpty { "Bientôt" }, Typography.TYPOGRAPHY_CAPTION1, Color.WHITE)),
              accentColor = courseColor,
              clickable = launchClickable
            )
          )
          addSpacer(contentColumn)
          val detailLines = buildList {
            add(TileLine("$prefix${nextCourse.subject}", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE))
            add(TileLine(timeRange, Typography.TYPOGRAPHY_CAPTION2, Color.argb(215, 255, 255, 255)))
            if (room != null) {
              val roomLabel = if (room.startsWith("salle", ignoreCase = true)) room else "Salle $room"
              add(TileLine("📍 $roomLabel", Typography.TYPOGRAPHY_CAPTION2, Color.WHITE))
            }
          }
          contentColumn.addContent(
            buildTileCard(
              context = context,
              lines = detailLines,
              accentColor = courseColor,
              clickable = launchClickable
            )
          )
        } else {
          contentColumn.addContent(
            buildTileCard(context, listOf(TileLine("Aucun cours à venir", Typography.TYPOGRAPHY_CAPTION1)), accentInt, launchClickable)
          )
        }
      }

      "homework" -> {
        headerLabel = if (pendingTasks.isEmpty()) "Devoirs" else "Devoirs (${pendingTasks.size})"
        val topTasks = pendingTasks.take(2)
        if (topTasks.isEmpty()) {
          contentColumn.addContent(
            buildTileCard(context, listOf(TileLine("Aucun devoir à faire", Typography.TYPOGRAPHY_CAPTION1)), accentInt, launchClickable)
          )
        } else {
          topTasks.forEachIndexed { idx, task ->
            if (idx > 0) addSpacer(contentColumn)
            val prefix = task.emoji?.let { "$it " } ?: ""
            val due = WearFormatters.formatRelativeDue(task.dueDate)
            val titleLine = if (due.isNotEmpty()) "$prefix${task.subject} · $due" else "$prefix${task.subject}"
            val desc = task.description.ifBlank { "À faire" }
            val color = WearFormatters.adjustColor(task.color, 0.20f, accentInt)
            contentColumn.addContent(
              buildTileCard(
                context = context,
                lines = listOf(
                  TileLine(titleLine, Typography.TYPOGRAPHY_CAPTION1, Color.WHITE),
                  TileLine(desc, Typography.TYPOGRAPHY_CAPTION2, Color.argb(215, 255, 255, 255))
                ),
                accentColor = color,
                clickable = launchClickable
              )
            )
          }
        }
      }

      "grade_average" -> {
        headerLabel = "Moyenne générale"
        val sub = snapshot?.overallAverageSubtitle?.takeIf { it.isNotBlank() }
          ?: snapshot?.accountName
          ?: "Papillon +"
        val avgLines = if (!avgText.isNullOrBlank()) {
          listOf(
            TileLine(avgText, Typography.TYPOGRAPHY_CAPTION1, Color.WHITE),
            TileLine(sub, Typography.TYPOGRAPHY_CAPTION2, Color.argb(215, 255, 255, 255))
          )
        } else {
          listOf(TileLine("Aucune moyenne calculée", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE))
        }
        contentColumn.addContent(
          buildTileCard(context, avgLines, accentInt, launchClickable)
        )
        val latest = grades.firstOrNull()
        if (latest != null) {
          addSpacer(contentColumn)
          val prefix = latest.emoji?.let { "$it " } ?: ""
          val color = WearFormatters.adjustColor(latest.color, 0.20f, accentInt)
          contentColumn.addContent(
            buildTileCard(
              context = context,
              lines = listOf(TileLine("$prefix${latest.subject} : ${latest.score}${latest.outOf}", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE)),
              accentColor = color,
              clickable = launchClickable
            )
          )
        }
      }

      "latest_grades" -> {
        headerLabel = "Nouvelles notes"
        val twoGrades = grades.take(2)
        if (twoGrades.isEmpty()) {
          contentColumn.addContent(
            buildTileCard(context, listOf(TileLine("Aucune note récente", Typography.TYPOGRAPHY_CAPTION1)), accentInt, launchClickable)
          )
        } else {
          twoGrades.forEachIndexed { idx, grade ->
            if (idx > 0) addSpacer(contentColumn)
            val prefix = grade.emoji?.let { "$it " } ?: ""
            val color = WearFormatters.adjustColor(grade.color, 0.20f, accentInt)
            val desc = grade.description.ifBlank { "Évaluation" }
            contentColumn.addContent(
              buildTileCard(
                context = context,
                lines = listOf(
                  TileLine("$prefix${grade.subject} — ${grade.score}${grade.outOf}", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE),
                  TileLine(desc, Typography.TYPOGRAPHY_CAPTION2, Color.argb(215, 255, 255, 255))
                ),
                accentColor = color,
                clickable = launchClickable
              )
            )
          }
        }
      }

      else -> {
        headerLabel = if (avgText != null) "Papillon + • $avgText" else "Papillon +"
        val courseLines = if (nextCourse != null) {
          val prefix = nextCourse.emoji?.let { "$it " } ?: ""
          val timeStr = WearFormatters.formatHour(nextCourse.from)
          val room = nextCourse.room?.trim()?.takeIf { it.isNotEmpty() }
          val metaLine = if (room != null) "📍 $room • $timeStr" else timeStr
          listOf(
            TileLine("$prefix${nextCourse.subject}", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE),
            TileLine(metaLine, Typography.TYPOGRAPHY_CAPTION2, Color.argb(225, 255, 255, 255))
          )
        } else {
          listOf(TileLine("Aucun cours à venir", Typography.TYPOGRAPHY_CAPTION1, Color.WHITE))
        }
        val courseColor = if (nextCourse != null) {
          WearFormatters.adjustColor(nextCourse.color, 0.20f, accentInt)
        } else {
          accentInt
        }
        contentColumn.addContent(
          buildTileCard(context, courseLines, courseColor, launchClickable)
        )
        addSpacer(contentColumn)
        val tasksCardText = when {
          pendingTasks.isNotEmpty() -> {
            val topTask = pendingTasks.first()
            val prefix = topTask.emoji?.let { "$it " } ?: ""
            "${pendingTasks.size} dev. • $prefix${topTask.subject}"
          }
          avgText != null -> "Moyenne : $avgText"
          else -> "Aucun devoir en attente"
        }
        val taskColor = if (pendingTasks.isNotEmpty()) {
          WearFormatters.adjustColor(pendingTasks.first().color, 0.20f, accentInt)
        } else {
          accentInt
        }
        contentColumn.addContent(
          buildTileCard(context, listOf(TileLine(tasksCardText, Typography.TYPOGRAPHY_CAPTION1, Color.WHITE)), taskColor, launchClickable)
        )
      }
    }

    return PrimaryLayout.Builder(deviceParams)
      .setResponsiveContentInsetEnabled(true)
      .setPrimaryLabelTextContent(
        Text.Builder(context, headerLabel)
          .setTypography(Typography.TYPOGRAPHY_CAPTION1)
          .setColor(argb(accentInt))
          .build()
      )
      .setContent(contentColumn.build())
      .setPrimaryChipContent(
        CompactChip.Builder(context, "Ouvrir", launchClickable, deviceParams)
          .build()
      )
      .build()
  }

  private fun addSpacer(column: LayoutElementBuilders.Column.Builder) {
    column.addContent(
      LayoutElementBuilders.Spacer.Builder()
        .setHeight(dp(6f))
        .build()
    )
  }

  private data class TileLine(
    val text: String,
    val typography: Int,
    val color: Int = Color.WHITE
  )

  private fun formatCompactTimeRange(fromMs: Long, toMs: Long): String {
    val start = WearFormatters.formatHour(fromMs)
    val end = if (toMs > fromMs) WearFormatters.formatHour(toMs) else ""
    return if (end.isNotEmpty()) "$start–$end" else start
  }

  private fun buildTileCard(
    context: Context,
    lines: List<TileLine>,
    accentColor: Int,
    clickable: ModifiersBuilders.Clickable
  ): LayoutElementBuilders.LayoutElement {
    val bgColor = Color.argb(
      52,
      Color.red(accentColor),
      Color.green(accentColor),
      Color.blue(accentColor)
    )
    val columnBuilder = LayoutElementBuilders.Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_START)

    lines.forEach { line ->
      columnBuilder.addContent(
        Text.Builder(context, line.text)
          .setTypography(line.typography)
          .setColor(argb(line.color))
          .setMaxLines(1)
          .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END)
          .build()
      )
    }

    return LayoutElementBuilders.Box.Builder()
      .setWidth(expand())
      .setHeight(wrap())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_START)
      .setModifiers(
        ModifiersBuilders.Modifiers.Builder()
          .setClickable(clickable)
          .setBackground(
            ModifiersBuilders.Background.Builder()
              .setColor(argb(bgColor))
              .setCorner(
                ModifiersBuilders.Corner.Builder()
                  .setRadius(dp(14f))
                  .build()
              )
              .build()
          )
          .setPadding(
            ModifiersBuilders.Padding.Builder()
              .setStart(dp(12f))
              .setEnd(dp(12f))
              .setTop(dp(8f))
              .setBottom(dp(8f))
              .build()
          )
          .build()
      )
      .addContent(columnBuilder.build())
      .build()
  }
}
