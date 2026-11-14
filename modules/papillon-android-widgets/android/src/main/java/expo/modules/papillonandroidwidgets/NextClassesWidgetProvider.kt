package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews

class NextClassesWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  companion object {
    private const val DEEP_LINK = "papillon://(tabs)/calendar"

    fun updateWidgets(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
    ) {
      val snapshot = WidgetStore.readSnapshot(context)
      val isNight = WidgetStore.isNightMode(context)
      val now = System.currentTimeMillis()
      val nextTwo = snapshot?.nextClasses
        ?.filter { it.to > now }
        ?.take(2)
        ?: emptyList()

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_next_classes)
        views.setOnClickPendingIntent(
          R.id.widget_root,
          WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1001)
        )

        if (!snapshot?.accountName.isNullOrBlank()) {
          views.setViewVisibility(R.id.widget_header_badge, View.VISIBLE)
          views.setTextViewText(R.id.widget_header_badge, snapshot?.accountName)
          if (!snapshot?.themeColor.isNullOrBlank()) {
            views.setTextColor(
              R.id.widget_header_badge,
              WidgetStore.readableSubjectColor(snapshot?.themeColor, isNight)
            )
          }
        } else {
          views.setViewVisibility(R.id.widget_header_badge, View.GONE)
        }

        if (nextTwo.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.course_1_container, View.GONE)
          views.setViewVisibility(R.id.course_2_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          bindCourseRow(
            views,
            nextTwo.getOrNull(0),
            isNight,
            R.id.course_1_container,
            R.id.course_1_bg,
            R.id.course_1_color,
            R.id.course_1_subject,
            R.id.course_1_details,
            R.id.course_1_time
          )
          bindCourseRow(
            views,
            nextTwo.getOrNull(1),
            isNight,
            R.id.course_2_container,
            R.id.course_2_bg,
            R.id.course_2_color,
            R.id.course_2_subject,
            R.id.course_2_details,
            R.id.course_2_time
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindCourseRow(
      views: RemoteViews,
      course: WidgetCourseItem?,
      isNight: Boolean,
      containerId: Int,
      bgId: Int,
      colorId: Int,
      subjectId: Int,
      detailsId: Int,
      timeId: Int,
    ) {
      if (course == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      val bgTint = if (course.isCanceled) {
        WidgetStore.softCardTint("#6B7280", isNight, ratio = if (isNight) 0.14f else 0.08f)
      } else {
        WidgetStore.softCardTint(course.color, isNight, ratio = if (isNight) 0.28f else 0.18f)
      }
      val accentColor = WidgetStore.readableSubjectColor(
        if (course.isCanceled) "#6B7280" else course.color,
        isNight
      )

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setInt(colorId, "setColorFilter", accentColor)
      views.setTextColor(subjectId, accentColor)
      views.setTextColor(timeId, accentColor)

      val titlePrefix = if (!course.emoji.isNullOrBlank()) "${course.emoji} " else ""
      views.setTextViewText(
        subjectId,
        if (course.isCanceled) "$titlePrefix${course.subject} (Annulé)" else "$titlePrefix${course.subject}"
      )
      val details = listOfNotNull(
        course.room?.let { "Salle $it" },
        course.teacher
      ).joinToString(" · ")
      views.setTextViewText(detailsId, details.ifEmpty { "Cours prévu" })
      views.setTextViewText(timeId, WidgetStore.formatTimeRange(course.from, course.to))
    }
  }
}
