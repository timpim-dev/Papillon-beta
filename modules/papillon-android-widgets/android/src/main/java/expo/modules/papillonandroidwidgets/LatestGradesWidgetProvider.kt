package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews

class LatestGradesWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, LatestGradesWidgetProvider::class.java))
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
      val grades = snapshot?.latestGrades?.take(2) ?: emptyList()

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_latest_grades)
        val deepLinkIntent = WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1002)
        views.setOnClickPendingIntent(R.id.widget_root, deepLinkIntent)
        views.setOnClickPendingIntent(R.id.widget_header_badge, deepLinkIntent)

        if (grades.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.grades_row_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          views.setViewVisibility(R.id.grades_row_container, View.VISIBLE)
          bindGradeCard(
            views,
            grades.getOrNull(0),
            isNight,
            R.id.grade_1_container,
            R.id.grade_1_bg,
            R.id.grade_1_emoji,
            R.id.grade_1_subject,
            R.id.grade_1_subtitle,
            R.id.grade_1_date,
            R.id.grade_1_score,
            R.id.grade_1_outof
          )
          bindGradeCard(
            views,
            grades.getOrNull(1),
            isNight,
            R.id.grade_2_container,
            R.id.grade_2_bg,
            R.id.grade_2_emoji,
            R.id.grade_2_subject,
            R.id.grade_2_subtitle,
            R.id.grade_2_date,
            R.id.grade_2_score,
            R.id.grade_2_outof
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindGradeCard(
      views: RemoteViews,
      grade: WidgetGradeItem?,
      isNight: Boolean,
      containerId: Int,
      bgId: Int,
      emojiId: Int,
      subjectId: Int,
      subtitleId: Int,
      dateId: Int,
      scoreId: Int,
      outOfId: Int,
    ) {
      if (grade == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      val bgTint = WidgetStore.adjustColor(grade.color, if (isNight) -0.82f else 0.85f)
      val tintedText = WidgetStore.adjustColor(grade.color, if (isNight) 0.50f else -0.50f)
      val tintedSec = WidgetStore.withAlpha(tintedText, 0.72f)

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setTextColor(subjectId, tintedSec)
      views.setTextColor(subtitleId, tintedText)
      views.setTextColor(dateId, tintedSec)
      views.setTextColor(scoreId, tintedText)
      views.setTextColor(outOfId, tintedSec)

      if (!grade.emoji.isNullOrBlank()) {
        views.setViewVisibility(emojiId, View.VISIBLE)
        views.setTextViewText(emojiId, grade.emoji)
      } else {
        views.setViewVisibility(emojiId, View.GONE)
      }
      views.setTextViewText(subjectId, grade.subject)
      views.setTextViewText(subtitleId, grade.description.ifBlank { "Évaluation" })
      views.setTextViewText(dateId, WidgetStore.formatRelativeDistanceDay(grade.date))
      views.setTextViewText(scoreId, grade.score)
      views.setTextViewText(outOfId, grade.outOf)
    }
  }
}
