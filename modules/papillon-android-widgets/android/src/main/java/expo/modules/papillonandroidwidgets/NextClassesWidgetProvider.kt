package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Color
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
      val upcoming = snapshot?.nextClasses
        ?.filter { it.to > now }
        ?.sortedBy { it.from }
        ?: emptyList()
      val firstCourse = upcoming.firstOrNull()
      val targetDayKey = firstCourse?.let { WidgetStore.dayKey(it.from) }
      val dayCourses = if (targetDayKey != null) {
        upcoming.filter { WidgetStore.dayKey(it.from) == targetDayKey }.take(3)
      } else {
        emptyList()
      }

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_next_classes)
        val deepLinkIntent = WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1001)
        views.setOnClickPendingIntent(R.id.widget_root, deepLinkIntent)
        views.setOnClickPendingIntent(R.id.widget_header_badge, deepLinkIntent)

        views.setTextViewText(
          R.id.widget_header_title,
          if (firstCourse != null) {
            WidgetStore.formatRelativeDayTitle(firstCourse.from)
          } else {
            context.getString(R.string.widget_next_classes_title)
          }
        )
        views.setViewVisibility(R.id.widget_header_badge, View.VISIBLE)
        views.setTextViewText(R.id.widget_header_badge, context.getString(R.string.widget_see_more))

        if (dayCourses.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.course_1_container, View.GONE)
          views.setViewVisibility(R.id.course_2_container, View.GONE)
          views.setViewVisibility(R.id.course_3_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          bindCourseRow(
            views,
            dayCourses.getOrNull(0),
            isNight,
            R.id.course_1_container,
            R.id.course_1_start,
            R.id.course_1_end,
            R.id.course_1_bg,
            R.id.course_1_color,
            R.id.course_1_subject,
            R.id.course_1_details,
            R.id.course_1_duration
          )
          bindCourseRow(
            views,
            dayCourses.getOrNull(1),
            isNight,
            R.id.course_2_container,
            R.id.course_2_start,
            R.id.course_2_end,
            R.id.course_2_bg,
            R.id.course_2_color,
            R.id.course_2_subject,
            R.id.course_2_details,
            R.id.course_2_duration
          )
          bindCourseRow(
            views,
            dayCourses.getOrNull(2),
            isNight,
            R.id.course_3_container,
            R.id.course_3_start,
            R.id.course_3_end,
            R.id.course_3_bg,
            R.id.course_3_color,
            R.id.course_3_subject,
            R.id.course_3_details,
            R.id.course_3_duration
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
      startId: Int,
      endId: Int,
      bgId: Int,
      colorId: Int,
      subjectId: Int,
      detailsId: Int,
      durationId: Int,
    ) {
      if (course == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      val bgTint = if (course.isCanceled) {
        if (isNight) Color.parseColor("#231214") else Color.parseColor("#FCE8E6")
      } else {
        WidgetStore.adjustColor(course.color, if (isNight) -0.70f else 0.75f)
      }
      val textColor = if (course.isCanceled) {
        if (isNight) Color.parseColor("#E57373") else Color.parseColor("#DC1400")
      } else {
        WidgetStore.adjustColor(course.color, if (isNight) 0.10f else -0.15f)
      }
      val secondaryTextColor = if (course.isCanceled) {
        WidgetStore.withAlpha(textColor, 0.85f)
      } else {
        textColor
      }

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setInt(colorId, "setColorFilter", textColor)
      views.setTextColor(subjectId, textColor)
      views.setTextColor(detailsId, secondaryTextColor)
      views.setTextColor(durationId, secondaryTextColor)

      views.setTextViewText(startId, WidgetStore.formatHourMinute(course.from))
      views.setTextViewText(endId, WidgetStore.formatHourMinute(course.to))

      // Matches in-app Course.tsx: no emoji prefix in course title
      views.setTextViewText(
        subjectId,
        if (course.isCanceled) "${course.subject} (Annulé)" else course.subject
      )
      val details = listOfNotNull(
        course.room?.takeIf { it.isNotBlank() },
        course.teacher?.takeIf { it.isNotBlank() }
      ).joinToString("  |  ")
      views.setTextViewText(detailsId, details.ifEmpty { "Cours prévu" })
      views.setTextViewText(durationId, WidgetStore.formatDuration(course.from, course.to))
    }
  }
}
