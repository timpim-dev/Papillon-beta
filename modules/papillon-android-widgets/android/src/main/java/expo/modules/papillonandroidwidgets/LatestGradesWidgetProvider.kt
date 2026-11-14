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
      val grades = snapshot?.latestGrades?.take(3) ?: emptyList()

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_latest_grades)
        views.setOnClickPendingIntent(
          R.id.widget_root,
          WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1002)
        )

        if (!snapshot?.overallAverage.isNullOrBlank()) {
          views.setViewVisibility(R.id.widget_average_badge, View.VISIBLE)
          views.setTextViewText(R.id.widget_average_badge, "Moy. ${snapshot?.overallAverage}")
        } else {
          views.setViewVisibility(R.id.widget_average_badge, View.GONE)
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
            R.id.grade_1_container,
            R.id.grade_1_color,
            R.id.grade_1_subject,
            R.id.grade_1_subtitle,
            R.id.grade_1_score
          )
          bindGradeRow(
            views,
            grades.getOrNull(1),
            R.id.grade_2_container,
            R.id.grade_2_color,
            R.id.grade_2_subject,
            R.id.grade_2_subtitle,
            R.id.grade_2_score
          )
          bindGradeRow(
            views,
            grades.getOrNull(2),
            R.id.grade_3_container,
            R.id.grade_3_color,
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
      containerId: Int,
      colorId: Int,
      subjectId: Int,
      subtitleId: Int,
      scoreId: Int,
    ) {
      if (grade == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)
      views.setInt(colorId, "setColorFilter", WidgetStore.parseColorSafe(grade.color))
      views.setTextViewText(subjectId, grade.subject)
      val dateLabel = WidgetStore.formatShortDate(grade.date)
      val subtitle = listOfNotNull(
        grade.description.takeIf { it.isNotBlank() },
        dateLabel.takeIf { it.isNotBlank() }
      ).joinToString(" · ")
      views.setTextViewText(subtitleId, subtitle.ifEmpty { "Évaluation" })
      views.setTextViewText(
        scoreId,
        if (grade.outOf.isNotBlank()) "${grade.score}${grade.outOf}" else grade.score
      )
    }
  }
}
