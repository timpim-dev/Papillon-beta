package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object WidgetUpdater {
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)

    val nextClassIds = manager.getAppWidgetIds(
      ComponentName(context, NextClassesWidgetProvider::class.java)
    )
    if (nextClassIds.isNotEmpty()) {
      NextClassesWidgetProvider.updateWidgets(context, manager, nextClassIds)
    }

    val gradesIds = manager.getAppWidgetIds(
      ComponentName(context, LatestGradesWidgetProvider::class.java)
    )
    if (gradesIds.isNotEmpty()) {
      LatestGradesWidgetProvider.updateWidgets(context, manager, gradesIds)
    }

    val tasksIds = manager.getAppWidgetIds(
      ComponentName(context, TasksWidgetProvider::class.java)
    )
    if (tasksIds.isNotEmpty()) {
      TasksWidgetProvider.updateWidgets(context, manager, tasksIds)
    }
  }
}
