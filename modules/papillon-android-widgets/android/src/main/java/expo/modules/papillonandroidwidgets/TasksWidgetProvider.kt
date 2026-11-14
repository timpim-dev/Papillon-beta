package expo.modules.papillonandroidwidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews

class TasksWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      ACTION_TOGGLE_TASK -> {
        val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
        val updatedJson = WidgetStore.recordPendingWearToggleAndUpdateSnapshot(
          context = context,
          taskId = taskId,
          isDone = true,
        )
        if (updatedJson != null) {
          WearDataLayerSync.publishSnapshot(context, updatedJson)
        }
        WidgetUpdater.updateAll(context)
      }
      Intent.ACTION_MY_PACKAGE_REPLACED -> {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, TasksWidgetProvider::class.java))
        if (ids.isNotEmpty()) {
          updateWidgets(context, manager, ids)
        }
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
    private const val DEEP_LINK = "papillon://(tabs)/tasks"
    const val ACTION_TOGGLE_TASK = "expo.modules.papillonandroidwidgets.ACTION_TOGGLE_TASK"
    const val EXTRA_TASK_ID = "task_id"

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
        views.setOnClickPendingIntent(R.id.widget_header_badge, deepLinkIntent)

        if (visibleTasks.isEmpty()) {
          views.setViewVisibility(R.id.widget_empty_text, View.VISIBLE)
          views.setViewVisibility(R.id.task_1_container, View.GONE)
          views.setViewVisibility(R.id.task_2_container, View.GONE)
          views.setViewVisibility(R.id.task_3_container, View.GONE)
        } else {
          views.setViewVisibility(R.id.widget_empty_text, View.GONE)
          bindTaskRow(
            context,
            views,
            visibleTasks.getOrNull(0),
            0,
            isNight,
            R.id.task_1_container,
            R.id.task_1_bg,
            R.id.task_1_color,
            R.id.task_1_subject,
            R.id.task_1_due,
            R.id.task_1_description,
            R.id.task_1_check_btn,
            R.id.task_1_check_icon
          )
          bindTaskRow(
            context,
            views,
            visibleTasks.getOrNull(1),
            1,
            isNight,
            R.id.task_2_container,
            R.id.task_2_bg,
            R.id.task_2_color,
            R.id.task_2_subject,
            R.id.task_2_due,
            R.id.task_2_description,
            R.id.task_2_check_btn,
            R.id.task_2_check_icon
          )
          bindTaskRow(
            context,
            views,
            visibleTasks.getOrNull(2),
            2,
            isNight,
            R.id.task_3_container,
            R.id.task_3_bg,
            R.id.task_3_color,
            R.id.task_3_subject,
            R.id.task_3_due,
            R.id.task_3_description,
            R.id.task_3_check_btn,
            R.id.task_3_check_icon
          )
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
      }
    }

    private fun bindTaskRow(
      context: Context,
      views: RemoteViews,
      task: WidgetTaskItem?,
      rowIndex: Int,
      isNight: Boolean,
      containerId: Int,
      bgId: Int,
      colorId: Int,
      subjectId: Int,
      dueId: Int,
      descriptionId: Int,
      checkBtnId: Int,
      checkIconId: Int,
    ) {
      if (task == null) {
        views.setViewVisibility(containerId, View.GONE)
        return
      }
      views.setViewVisibility(containerId, View.VISIBLE)

      val bgTint = WidgetStore.adjustColor(task.color, if (isNight) -0.70f else 0.75f)
      val subjectColor = WidgetStore.adjustColor(task.color, if (isNight) 0.15f else -0.15f)
      val dueColor = WidgetStore.withAlpha(subjectColor, 0.78f)
      val descColor = WidgetStore.withAlpha(subjectColor, 0.92f)

      views.setInt(bgId, "setColorFilter", bgTint)
      views.setInt(colorId, "setColorFilter", subjectColor)
      views.setTextColor(subjectId, subjectColor)
      views.setTextColor(dueId, dueColor)
      views.setTextColor(descriptionId, descColor)
      views.setInt(checkIconId, "setColorFilter", subjectColor)

      views.setTextViewText(subjectId, task.subject)
      views.setTextViewText(dueId, WidgetStore.formatRelativeDistanceDay(task.dueDate))
      views.setTextViewText(descriptionId, task.description.ifBlank { "Devoir à faire" })

      val toggleIntent = Intent(context, TasksWidgetProvider::class.java).apply {
        action = ACTION_TOGGLE_TASK
        setPackage(context.packageName)
        putExtra(EXTRA_TASK_ID, task.id)
      }
      val togglePendingIntent = PendingIntent.getBroadcast(
        context,
        3100 + rowIndex,
        toggleIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(checkBtnId, togglePendingIntent)
    }
  }
}
