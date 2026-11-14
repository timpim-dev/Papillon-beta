package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews

class LatestGradesWidgetProvider : AppWidgetProvider() {
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
      val grades = snapshot?.latestGrades?.take(3) ?: emptyList()

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_latest_grades)
        val deepLinkIntent = WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1002)
        views.setOnClickPendingIntent(R.id.widget_root, deepLinkIntent)
        views.setOnClickPendingIntent(R.id.widget_average_badge, deepLinkIntent)

        views.setViewVisibility(R.id.widget_average_badge, View.VISIBLE)
        if (!snapshot?.overallAverage.isNullOrBlank()) {
          views.setTextViewText(R.id.widget_average_badge, "Moy. ${snapshot?.overallAverage}")
        } else {
          views.setTextViewText(R.id.widget_average_badge, context.getString(R.string.widget_see_more))
        }

        if (grades.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.grade_1_container, View.GONE)
          views.setViewVisibility(R.id.grade_2_container, View.GONE)
          views.setViewVisibility(R.id.grade_3_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          bindGradeRow(
            views,
            grades.getOrNull(0),
            isNight,
            R.id.grade_1_container,
            R.id.grade_1_bg,
            R.id.grade_1_subject,
            R.id.grade_1_subtitle,
            R.id.grade_1_score
          )
          bindGradeRow(
            views,
            grades.getOrNull(1),
            isNight,
            R.id.grade_2_container,
            R.id.grade_2_bg,
            R.id.grade_2_subject,
            R.id.grade_2_subtitle,
            R.id.grade_2_score
          )
          bindGradeRow(
            views,
            grades.getOrNull(2),
            isNight,
            R.id.grade_3_container,
            R.id.grade_3_bg,
            R.id.grade_3_subject,
            R.id.grade_3_subtitle,
            R.id.grade_3_score
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindGradeRow(
      views: RemoteViews,
      grade: WidgetGradeItem?,
      isNight: Boolean,
      containerId: Int,
      bgId: Int,
      subjectId: Int,
      subtitleId: Int,
      scoreId: Int,
    ) {
      if (grade == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      // Matches in-app CompactGrade.tsx: soft tinted fill, primary text ±0.50, secondary alpha 0.72
      val bgTint = WidgetStore.adjustColor(grade.color, if (isNight) -0.82f else 0.85f)
      val tintedText = WidgetStore.adjustColor(grade.color, if (isNight) 0.50f else -0.50f)
      val tintedSec = WidgetStore.withAlpha(tintedText, 0.72f)

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setTextColor(subjectId, tintedSec)
      views.setTextColor(subtitleId, tintedText)
      views.setTextColor(scoreId, tintedText)

      val emojiPrefix = if (!grade.emoji.isNullOrBlank()) "${grade.emoji} " else ""
      val dateLabel = WidgetStore.formatShortDate(grade.date)
      val topLabel = listOfNotNull(
        "$emojiPrefix${grade.subject}",
        dateLabel.takeIf { it.isNotBlank() }
      ).joinToString(" · ")
      views.setTextViewText(subjectId, topLabel)
      views.setTextViewText(subtitleId, grade.description.ifBlank { "Évaluation" })
      views.setTextViewText(
        scoreId,
        if (grade.outOf.isNotBlank()) "${grade.score}${grade.outOf}" else grade.score
      )
    }
  }
}
