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
            buildTileCard(context, "Aucun cours à venir", accentInt, launchClickable)
          )
        } else {
          twoCourses.forEachIndexed { idx, course ->
            if (idx > 0) addSpacer(contentColumn)
            val prefix = course.emoji?.let { "$it " } ?: ""
            val timeRange = WearFormatters.formatTimeRange(course.from, course.to)
            val room = course.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
            val color = WearFormatters.adjustColor(course.color, 0.20f, accentInt)
            contentColumn.addContent(
              buildTileCard(
                context = context,
                text = "$prefix${course.subject}\n$timeRange$room",
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
          val room = nextCourse.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
          contentColumn.addContent(
            buildTileCard(
              context = context,
              text = countdown.ifEmpty { "Bientôt" },
              accentColor = courseColor,
              clickable = launchClickable,
              maxLines = 1
            )
          )
          addSpacer(contentColumn)
          contentColumn.addContent(
            buildTileCard(
              context = context,
              text = "$prefix${nextCourse.subject}\n$timeRange$room",
              accentColor = courseColor,
              clickable = launchClickable,
              maxLines = 2
            )
          )
        } else {
          contentColumn.addContent(
            buildTileCard(context, "Aucun cours à venir", accentInt, launchClickable)
          )
        }
      }

      "homework" -> {
        headerLabel = if (pendingTasks.isEmpty()) "Devoirs" else "Devoirs (${pendingTasks.size})"
        val topTasks = pendingTasks.take(2)
        if (topTasks.isEmpty()) {
          contentColumn.addContent(
            buildTileCard(context, "Aucun devoir à faire", accentInt, launchClickable)
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
                text = "$titleLine\n$desc",
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
        val avgCard = if (!avgText.isNullOrBlank()) "$avgText\n$sub" else "Aucune moyenne calculée"
        contentColumn.addContent(
          buildTileCard(context, avgCard, accentInt, launchClickable)
        )
        val latest = grades.firstOrNull()
        if (latest != null) {
          addSpacer(contentColumn)
          val prefix = latest.emoji?.let { "$it " } ?: ""
          val color = WearFormatters.adjustColor(latest.color, 0.20f, accentInt)
          contentColumn.addContent(
            buildTileCard(
              context = context,
              text = "$prefix${latest.subject} : ${latest.score}${latest.outOf}",
              accentColor = color,
              clickable = launchClickable,
              maxLines = 1
            )
          )
        }
      }

      "latest_grades" -> {
        headerLabel = "Nouvelles notes"
        val twoGrades = grades.take(2)
        if (twoGrades.isEmpty()) {
          contentColumn.addContent(
            buildTileCard(context, "Aucune note récente", accentInt, launchClickable)
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
                text = "$prefix${grade.subject} — ${grade.score}${grade.outOf}\n$desc",
                accentColor = color,
                clickable = launchClickable
              )
            )
          }
        }
      }

      else -> {
        headerLabel = if (avgText != null) "Papillon + • $avgText" else "Papillon +"
        val courseCardText = if (nextCourse != null) {
          val prefix = nextCourse.emoji?.let { "$it " } ?: ""
          val timeStr = WearFormatters.formatHour(nextCourse.from)
          val roomStr = nextCourse.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
          "$prefix${nextCourse.subject}\n$timeStr$roomStr"
        } else {
          "Aucun cours à venir"
        }
        val courseColor = if (nextCourse != null) {
          WearFormatters.adjustColor(nextCourse.color, 0.20f, accentInt)
        } else {
          accentInt
        }
        contentColumn.addContent(
          buildTileCard(context, courseCardText, courseColor, launchClickable)
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
          buildTileCard(context, tasksCardText, taskColor, launchClickable)
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

  private fun buildTileCard(
    context: Context,
    text: String,
    accentColor: Int,
    clickable: ModifiersBuilders.Clickable,
    maxLines: Int = 2
  ): LayoutElementBuilders.LayoutElement {
    val bgColor = Color.argb(
      52,
      Color.red(accentColor),
      Color.green(accentColor),
      Color.blue(accentColor)
    )
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
      .addContent(
        Text.Builder(context, text)
          .setTypography(Typography.TYPOGRAPHY_CAPTION1)
          .setColor(argb(Color.WHITE))
          .setMaxLines(maxLines)
          .build()
      )
      .build()
  }
}
