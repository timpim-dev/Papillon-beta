package expo.modules.papillonandroidwidgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class WidgetCourseItem(
  val id: String,
  val subject: String,
  val room: String?,
  val teacher: String?,
  val color: String,
  val from: Long,
  val to: Long,
  val isCanceled: Boolean,
)

data class WidgetGradeItem(
  val id: String,
  val subject: String,
  val description: String,
  val score: String,
  val outOf: String,
  val color: String,
  val date: Long,
)

data class WidgetTaskItem(
  val id: String,
  val subject: String,
  val description: String,
  val color: String,
  val dueDate: Long,
  val isDone: Boolean,
)

data class WidgetSnapshot(
  val updatedAt: Long,
  val accountName: String?,
  val overallAverage: String?,
  val nextClasses: List<WidgetCourseItem>,
  val latestGrades: List<WidgetGradeItem>,
  val tasks: List<WidgetTaskItem>,
)

object WidgetStore {
  private const val PREFS_NAME = "papillon_widgets_store"
  private const val KEY_SNAPSHOT_JSON = "snapshot_json"

  fun saveSnapshot(context: Context, jsonString: String) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SNAPSHOT_JSON, jsonString)
      .apply()
  }

  fun readRawJson(context: Context): String? {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_SNAPSHOT_JSON, null)
  }

  fun readSnapshot(context: Context): WidgetSnapshot? {
    val raw = readRawJson(context) ?: return null
    return try {
      val root = JSONObject(raw)
      WidgetSnapshot(
        updatedAt = root.optLong("updatedAt", 0L),
        accountName = root.optString("accountName").takeIf { it.isNotEmpty() && it != "null" },
        overallAverage = root.optString("overallAverage").takeIf { it.isNotEmpty() && it != "null" },
        nextClasses = parseCourses(root.optJSONArray("nextClasses")),
        latestGrades = parseGrades(root.optJSONArray("latestGrades")),
        tasks = parseTasks(root.optJSONArray("tasks")),
      )
    } catch (_: Throwable) {
      null
    }
  }

  private fun parseCourses(array: JSONArray?): List<WidgetCourseItem> {
    if (array == null) return emptyList()
    val items = mutableListOf<WidgetCourseItem>()
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      items.add(
        WidgetCourseItem(
          id = obj.optString("id"),
          subject = obj.optString("subject"),
          room = obj.optString("room").takeIf { it.isNotEmpty() && it != "null" },
          teacher = obj.optString("teacher").takeIf { it.isNotEmpty() && it != "null" },
          color = obj.optString("color", "#29947A"),
          from = obj.optLong("from", 0L),
          to = obj.optLong("to", 0L),
          isCanceled = obj.optBoolean("isCanceled", false),
        )
      )
    }
    return items
  }

  private fun parseGrades(array: JSONArray?): List<WidgetGradeItem> {
    if (array == null) return emptyList()
    val items = mutableListOf<WidgetGradeItem>()
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      items.add(
        WidgetGradeItem(
          id = obj.optString("id"),
          subject = obj.optString("subject"),
          description = obj.optString("description"),
          score = obj.optString("score"),
          outOf = obj.optString("outOf"),
          color = obj.optString("color", "#29947A"),
          date = obj.optLong("date", 0L),
        )
      )
    }
    return items
  }

  private fun parseTasks(array: JSONArray?): List<WidgetTaskItem> {
    if (array == null) return emptyList()
    val items = mutableListOf<WidgetTaskItem>()
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      items.add(
        WidgetTaskItem(
          id = obj.optString("id"),
          subject = obj.optString("subject"),
          description = obj.optString("description"),
          color = obj.optString("color", "#29947A"),
          dueDate = obj.optLong("dueDate", 0L),
          isDone = obj.optBoolean("isDone", false),
        )
      )
    }
    return items
  }

  fun parseColorSafe(hex: String?, fallback: Int = Color.parseColor("#29947A")): Int {
    if (hex.isNullOrBlank()) return fallback
    return try {
      Color.parseColor(hex)
    } catch (_: IllegalArgumentException) {
      fallback
    }
  }

  fun formatTimeRange(fromMs: Long, toMs: Long): String {
    val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())
    return "${formatter.format(Date(fromMs))} - ${formatter.format(Date(toMs))}"
  }

  fun formatShortDate(dateMs: Long): String {
    if (dateMs <= 0L) return ""
    val formatter = SimpleDateFormat("dd/MM", Locale.getDefault())
    return formatter.format(Date(dateMs))
  }

  fun formatDueDate(dateMs: Long): String {
    if (dateMs <= 0L) return ""
    val target = Calendar.getInstance().apply { timeInMillis = dateMs }
    val today = Calendar.getInstance()
    val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }

    return when {
      isSameDay(target, today) -> "Auj."
      isSameDay(target, tomorrow) -> "Dem."
      else -> SimpleDateFormat("EEE dd/MM", Locale.FRENCH).format(Date(dateMs))
    }
  }

  private fun isSameDay(a: Calendar, b: Calendar): Boolean {
    return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) &&
      a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
  }

  fun createDeepLinkIntent(context: Context, uriString: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
      setPackage(context.packageName)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
