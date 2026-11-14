package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews

class TasksWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  companion object {
    private const val DEEP_LINK = "papillon://(tabs)/tasks"

    fun updateWidgets(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
    ) {
      val snapshot = WidgetStore.readSnapshot(context)
      val pendingTasks = snapshot?.tasks?.filter { !it.isDone } ?: emptyList()
      val visibleTasks = pendingTasks.take(3)

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_tasks)
        views.setOnClickPendingIntent(
          R.id.widget_root,
          WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1003)
        )

        if (pendingTasks.isNotEmpty()) {
          views.setViewVisibility(R.id.widget_tasks_count_badge, View.VISIBLE)
          views.setTextViewText(R.id.widget_tasks_count_badge, "${pendingTasks.size}")
        } else {
          views.setViewVisibility(R.id.widget_tasks_count_badge, View.GONE)
        }

        if (visibleTasks.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.task_1_container, View.GONE)
          views.setViewVisibility(R.id.task_2_container, View.GONE)
          views.setViewVisibility(R.id.task_3_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          bindTaskRow(
            views,
            visibleTasks.getOrNull(0),
            R.id.task_1_container,
            R.id.task_1_color,
            R.id.task_1_subject,
            R.id.task_1_description,
            R.id.task_1_due
          )
          bindTaskRow(
            views,
            visibleTasks.getOrNull(1),
            R.id.task_2_container,
            R.id.task_2_color,
            R.id.task_2_subject,
            R.id.task_2_description,
            R.id.task_2_due
          )
          bindTaskRow(
            views,
            visibleTasks.getOrNull(2),
            R.id.task_3_container,
            R.id.task_3_color,
            R.id.task_3_subject,
            R.id.task_3_description,
            R.id.task_3_due
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindTaskRow(
      views: RemoteViews,
      task: WidgetTaskItem?,
      containerId: Int,
      colorId: Int,
      subjectId: Int,
      descriptionId: Int,
      dueId: Int,
    ) {
      if (task == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)
      views.setInt(colorId, "setColorFilter", WidgetStore.parseColorSafe(task.color))
      views.setTextViewText(subjectId, task.subject)
      views.setTextViewText(descriptionId, task.description.ifBlank { "Devoir à faire" })
      views.setTextViewText(dueId, WidgetStore.formatDueDate(task.dueDate))
    }
  }
}
