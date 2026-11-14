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
      val isNight = WidgetStore.isNightMode(context)
      val pendingTasks = snapshot?.tasks
        ?.filter { !it.isDone }
        ?.sortedBy { it.dueDate }
        ?: emptyList()
      val visibleTasks = pendingTasks.take(3)

      for (appWidgetId in appWidgetIds) {
        val views = RemoteViews(context.packageName, R.layout.widget_tasks)
        val deepLinkIntent = WidgetStore.createDeepLinkIntent(context, DEEP_LINK, 1003)
        views.setOnClickPendingIntent(R.id.widget_root, deepLinkIntent)
        views.setOnClickPendingIntent(R.id.widget_tasks_count_badge, deepLinkIntent)

        views.setViewVisibility(R.id.widget_tasks_count_badge, View.VISIBLE)
        views.setTextViewText(
          R.id.widget_tasks_count_badge,
          if (pendingTasks.isNotEmpty()) {
            "${pendingTasks.size} • ${context.getString(R.string.widget_see_more)}"
          } else {
            context.getString(R.string.widget_see_more)
          }
        )

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
            isNight,
            R.id.task_1_container,
            R.id.task_1_emoji,
            R.id.task_1_subject,
            R.id.task_1_due,
            R.id.task_1_description
          )
          bindTaskRow(
            views,
            visibleTasks.getOrNull(1),
            isNight,
            R.id.task_2_container,
            R.id.task_2_emoji,
            R.id.task_2_subject,
            R.id.task_2_due,
            R.id.task_2_description
          )
          bindTaskRow(
            views,
            visibleTasks.getOrNull(2),
            isNight,
            R.id.task_3_container,
            R.id.task_3_emoji,
            R.id.task_3_subject,
            R.id.task_3_due,
            R.id.task_3_description
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindTaskRow(
      views: RemoteViews,
      task: WidgetTaskItem?,
      isNight: Boolean,
      containerId: Int,
      emojiId: Int,
      subjectId: Int,
      dueId: Int,
      descriptionId: Int,
    ) {
      if (task == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      // Matches in-app Task.tsx: neutral card + colored emoji & subject via adjust(color, ±0.30)
      val subjectColor = WidgetStore.adjustColor(task.color, if (isNight) 0.30f else -0.30f)
      views.setTextColor(subjectId, subjectColor)

      if (!task.emoji.isNullOrBlank()) {
        views.setViewVisibility(emojiId, View.VISIBLE)
        views.setTextViewText(emojiId, task.emoji)
      } else {
        views.setViewVisibility(emojiId, View.GONE)
      }
      views.setTextViewText(subjectId, task.subject)
      views.setTextViewText(dueId, WidgetStore.formatRelativeDistanceDay(task.dueDate))
      views.setTextViewText(descriptionId, task.description.ifBlank { "Devoir à faire" })
    }
  }
}
