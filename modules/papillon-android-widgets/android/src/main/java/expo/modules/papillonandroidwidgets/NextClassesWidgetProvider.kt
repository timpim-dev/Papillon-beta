package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews

class NextClassesWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NextClassesWidgetProvider::class.java))
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
            R.id.course_1_pin_icon,
            R.id.course_1_room,
            R.id.course_1_sep,
            R.id.course_1_teacher_container,
            R.id.course_1_user_icon,
            R.id.course_1_teacher,
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
            R.id.course_2_pin_icon,
            R.id.course_2_room,
            R.id.course_2_sep,
            R.id.course_2_teacher_container,
            R.id.course_2_user_icon,
            R.id.course_2_teacher,
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
            R.id.course_3_pin_icon,
            R.id.course_3_room,
            R.id.course_3_sep,
            R.id.course_3_teacher_container,
            R.id.course_3_user_icon,
            R.id.course_3_teacher,
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
      pinIconId: Int,
      roomId: Int,
      sepId: Int,
      teacherContainerId: Int,
      userIconId: Int,
      teacherId: Int,
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
      val metaTextColor = WidgetStore.withAlpha(textColor, 0.90f)
      val sepColor = WidgetStore.withAlpha(textColor, 0.50f)
      val durationColor = WidgetStore.withAlpha(textColor, 0.85f)

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setInt(colorId, "setColorFilter", textColor)
      views.setTextColor(subjectId, textColor)
      views.setInt(pinIconId, "setColorFilter", metaTextColor)
      views.setTextColor(roomId, metaTextColor)
      views.setTextColor(sepId, sepColor)
      views.setInt(userIconId, "setColorFilter", metaTextColor)
      views.setTextColor(teacherId, metaTextColor)
      views.setTextColor(durationId, durationColor)

      views.setTextViewText(startId, WidgetStore.formatHourMinute(course.from))
      views.setTextViewText(endId, WidgetStore.formatHourMinute(course.to))
      views.setTextViewText(
        subjectId,
        if (course.isCanceled) "${course.subject} (Annulé)" else course.subject
      )

      val room = course.room?.trim()?.takeIf { it.isNotEmpty() }
      val teacher = course.teacher?.trim()?.takeIf { it.isNotEmpty() }

      if (room != null) {
        views.setViewVisibility(pinIconId, View.VISIBLE)
        views.setViewVisibility(roomId, View.VISIBLE)
        views.setTextViewText(roomId, room)
      } else if (teacher == null) {
        views.setViewVisibility(pinIconId, View.GONE)
        views.setViewVisibility(roomId, View.VISIBLE)
        views.setTextViewText(roomId, "Cours prévu")
      } else {
        views.setViewVisibility(pinIconId, View.GONE)
        views.setViewVisibility(roomId, View.GONE)
      }

      if (teacher != null) {
        views.setViewVisibility(teacherContainerId, View.VISIBLE)
        views.setTextViewText(teacherId, teacher)
      } else {
        views.setViewVisibility(teacherContainerId, View.GONE)
      }

      views.setViewVisibility(
        sepId,
        if (room != null && teacher != null) View.VISIBLE else View.GONE
      )
      views.setTextViewText(durationId, WidgetStore.formatDuration(course.from, course.to))
    }
  }
}
