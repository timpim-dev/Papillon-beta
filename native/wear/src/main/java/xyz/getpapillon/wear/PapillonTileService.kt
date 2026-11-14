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
      .setFreshnessIntervalMillis(15 * 60 * 1000L)
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
    val defaultAccent = Color.parseColor("#6D8BFF")
    val accentInt = if (snapshot?.effectiveSyncGradient(prefs) != false) {
      WearFormatters.parseColorInt(snapshot?.themeColor, defaultAccent)
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
    val nextCourse = snapshot?.nextClasses?.firstOrNull { !it.isCanceled && it.to > now }
      ?: snapshot?.nextClasses?.firstOrNull()
    val pendingTasks = snapshot?.tasks?.filter { !it.isDone }.orEmpty()
    val avgText = snapshot?.overallAverage

    val contentColumn = LayoutElementBuilders.Column.Builder()
      .setWidth(expand())
      .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)

    val courseCardText = if (nextCourse != null) {
      val prefix = nextCourse.emoji?.let { "$it " } ?: ""
      val timeStr = WearFormatters.formatHour(nextCourse.from)
      val roomStr = nextCourse.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
      "$prefix${nextCourse.subject}\n$timeStr$roomStr"
    } else {
      "Aucun cours à venir"
    }

    val courseColor = if (nextCourse != null) {
      WearFormatters.parseColorInt(nextCourse.color, accentInt)
    } else {
      accentInt
    }

    contentColumn.addContent(
      buildTileCard(
        context = context,
        text = courseCardText,
        accentColor = courseColor,
        clickable = launchClickable
      )
    )

    contentColumn.addContent(
      LayoutElementBuilders.Spacer.Builder()
        .setHeight(dp(6f))
        .build()
    )

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
      WearFormatters.parseColorInt(pendingTasks.first().color, accentInt)
    } else {
      accentInt
    }

    contentColumn.addContent(
      buildTileCard(
        context = context,
        text = tasksCardText,
        accentColor = taskColor,
        clickable = launchClickable
      )
    )

    val headerLabel = if (avgText != null) "Papillon + • $avgText" else "Papillon +"

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

  private fun buildTileCard(
    context: Context,
    text: String,
    accentColor: Int,
    clickable: ModifiersBuilders.Clickable
  ): LayoutElementBuilders.LayoutElement {
    val bgColor = Color.argb(
      46,
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
          .setMaxLines(2)
          .build()
      )
      .build()
  }
}
