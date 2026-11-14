package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews

class AverageWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, AverageWidgetProvider::class.java))
      if (ids.isNotEmpty()) {
        updateWidgets(context, manager, ids)
      }
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  companion object {
    private const val DEEP_LINK = "papillon://(tabs)/grades"

    fun updateWidgets(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
    ) {
      val snapshot = WidgetStore.readSnapshot(context)
      val isNight = WidgetStore.isNightMode(context)

      val avgValue = snapshot?.overallAverageValue
        ?: snapshot?.overallAverage?.substringBefore("/")?.trim()
      val avgScale = snapshot?.overallAverageScale
        ?: snapshot?.overallAverage?.let { raw ->
          if (raw.contains("/")) "/${raw.substringAfter("/")}" else "/20"
        }
        ?: "/20"

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_average)
        val deepLinkIntent = WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1004)
        views.setOnClickPendingIntent(R.id.widget_root, deepLinkIntent)
        views.setOnClickPendingIntent(R.id.widget_header_badge, deepLinkIntent)

        if (avgValue.isNullOrBlank()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.average_card_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          views.setViewVisibility(R.id.average_card_container, View.VISIBLE)

          val accentColor = WidgetStore.adjustColor(
            snapshot?.themeColor,
            if (isNight) 0.20f else -0.20f
          )
          val secondaryAccent = WidgetStore.withAlpha(accentColor, 0.72f)

          views.setTextViewText(R.id.average_value, avgValue)
          views.setTextColor(R.id.average_value, accentColor)
          views.setTextViewText(R.id.average_scale, avgScale)
          views.setTextColor(R.id.average_scale, secondaryAccent)
          views.setTextViewText(
            R.id.average_subtitle,
            snapshot?.overallAverageSubtitle?.takeIf { it.isNotBlank() } ?: "par l'établissement"
          )

          val numericFallback = avgValue.replace(",", ".").toFloatOrNull()
          val graphPoints = snapshot?.averageHistory?.takeIf { it.isNotEmpty() }
            ?: listOfNotNull(numericFallback)
          val graphBitmap = WidgetStore.renderAverageGraphBitmap(
            points = graphPoints,
            accentColor = accentColor,
          )
          views.setImageViewBitmap(R.id.average_graph_image, graphBitmap)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }
  }
}
