package expo.modules.papillonandroidwidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object WidgetUpdater {
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)

    val nextClassesIds = manager.getAppWidgetIds(
      ComponentName(context, NextClassesWidgetProvider::class.java)
    )
    if (nextClassesIds.isNotEmpty()) {
      NextClassesWidgetProvider.updateWidgets(context, manager, nextClassesIds)
    }

    val gradesIds = manager.getAppWidgetIds(
      ComponentName(context, LatestGradesWidgetProvider::class.java)
    )
    if (gradesIds.isNotEmpty()) {
      LatestGradesWidgetProvider.updateWidgets(context, manager, gradesIds)
    }

    val averageIds = manager.getAppWidgetIds(
      ComponentName(context, AverageWidgetProvider::class.java)
    )
    if (averageIds.isNotEmpty()) {
      AverageWidgetProvider.updateWidgets(context, manager, averageIds)
    }

    val tasksIds = manager.getAppWidgetIds(
      ComponentName(context, TasksWidgetProvider::class.java)
    )
    if (tasksIds.isNotEmpty()) {
      TasksWidgetProvider.updateWidgets(context, manager, tasksIds)
    }
  }
}
