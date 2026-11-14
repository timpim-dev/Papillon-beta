package expo.modules.papillonandroidwidgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

data class WidgetCourseItem(
  val id: String,
  val subject: String,
  val emoji: String?,
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
  val emoji: String?,
  val description: String,
  val score: String,
  val outOf: String,
  val color: String,
  val date: Long,
)

data class WidgetTaskItem(
  val id: String,
  val subject: String,
  val emoji: String?,
  val description: String,
  val color: String,
  val dueDate: Long,
  val isDone: Boolean,
)

data class WidgetSnapshot(
  val updatedAt: Long,
  val accountName: String?,
  val overallAverage: String?,
  val themeColor: String?,
  val nextClasses: List<WidgetCourseItem>,
  val latestGrades: List<WidgetGradeItem>,
  val tasks: List<WidgetTaskItem>,
)

object WidgetStore {
  private const val PREFS_NAME = "papillon_widgets_store"
  private const val KEY_SNAPSHOT_JSON = "snapshot_json"
  private const val KEY_PENDING_WEAR_TOGGLES = "pending_wear_task_toggles"
  private val lock = Any()

  fun saveSnapshot(context: Context, jsonString: String) {
    synchronized(lock) {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_SNAPSHOT_JSON, jsonString)
        .apply()
    }
  }

  fun readRawJson(context: Context): String? {
    synchronized(lock) {
      return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getString(KEY_SNAPSHOT_JSON, null)
    }
  }

  fun readSnapshot(context: Context): WidgetSnapshot? {
    val raw = readRawJson(context) ?: return null
    return try {
      val root = JSONObject(raw)
      WidgetSnapshot(
        updatedAt = root.optLong("updatedAt", 0L),
        accountName = root.optString("accountName").takeIf { it.isNotEmpty() && it != "null" },
        overallAverage = root.optString("overallAverage").takeIf { it.isNotEmpty() && it != "null" },
        themeColor = root.optString("themeColor").takeIf { it.isNotEmpty() && it != "null" },
        nextClasses = parseCourses(root.optJSONArray("nextClasses")),
        latestGrades = parseGrades(root.optJSONArray("latestGrades")),
        tasks = parseTasks(root.optJSONArray("tasks")),
      )
    } catch (_: Throwable) {
      null
    }
  }

  fun recordPendingWearToggleAndUpdateSnapshot(
    context: Context,
    taskId: String,
    isDone: Boolean,
  ): String? {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val existingTogglesRaw = prefs.getString(KEY_PENDING_WEAR_TOGGLES, "[]") ?: "[]"
      val queue = try {
        JSONArray(existingTogglesRaw)
      } catch (_: Throwable) {
        JSONArray()
      }
      val filtered = JSONArray()
      for (i in 0 until queue.length()) {
        val entry = queue.optJSONObject(i) ?: continue
        if (entry.optString("id") != taskId) {
          filtered.put(entry)
        }
      }
      filtered.put(
        JSONObject().apply {
          put("id", taskId)
          put("isDone", isDone)
        }
      )

      val rawSnapshot = prefs.getString(KEY_SNAPSHOT_JSON, null)
      val updatedSnapshotJson = rawSnapshot?.let { raw ->
        try {
          val root = JSONObject(raw)
          val tasks = root.optJSONArray("tasks")
          if (tasks != null) {
            for (i in 0 until tasks.length()) {
              val item = tasks.optJSONObject(i) ?: continue
              if (item.optString("id") == taskId) {
                item.put("isDone", isDone)
              }
            }
          }
          root.put("updatedAt", System.currentTimeMillis())
          root.toString()
        } catch (_: Throwable) {
          null
        }
      }

      val editor = prefs.edit().putString(KEY_PENDING_WEAR_TOGGLES, filtered.toString())
      if (updatedSnapshotJson != null) {
        editor.putString(KEY_SNAPSHOT_JSON, updatedSnapshotJson)
      }
      editor.apply()

      return updatedSnapshotJson
    }
  }

  fun consumePendingWearToggles(context: Context): List<Map<String, Any>> {
    synchronized(lock) {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_PENDING_WEAR_TOGGLES, null) ?: return emptyList()
      prefs.edit().remove(KEY_PENDING_WEAR_TOGGLES).apply()
      val array = try {
        JSONArray(raw)
      } catch (_: Throwable) {
        return emptyList()
      }
      val list = mutableListOf<Map<String, Any>>()
      for (i in 0 until array.length()) {
        val obj = array.optJSONObject(i) ?: continue
        val id = obj.optString("id")
        if (id.isNotEmpty()) {
          list.add(
            mapOf(
              "id" to id,
              "isDone" to obj.optBoolean("isDone", false),
            )
          )
        }
      }
      return list
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
          emoji = obj.optString("emoji").takeIf { it.isNotEmpty() && it != "null" },
          room = obj.optString("room").takeIf { it.isNotEmpty() && it != "null" },
          teacher = obj.optString("teacher").takeIf { it.isNotEmpty() && it != "null" },
          color = obj.optString("color", "#26B290"),
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
          emoji = obj.optString("emoji").takeIf { it.isNotEmpty() && it != "null" },
          description = obj.optString("description"),
          score = obj.optString("score"),
          outOf = obj.optString("outOf"),
          color = obj.optString("color", "#26B290"),
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
          emoji = obj.optString("emoji").takeIf { it.isNotEmpty() && it != "null" },
          description = obj.optString("description"),
          color = obj.optString("color", "#26B290"),
          dueDate = obj.optLong("dueDate", 0L),
          isDone = obj.optBoolean("isDone", false),
        )
      )
    }
    return items
  }

  fun isNightMode(context: Context): Boolean {
    val nightModeFlags =
      context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    return nightModeFlags == Configuration.UI_MODE_NIGHT_YES
  }

  fun parseColorSafe(hex: String?, fallback: Int = Color.parseColor("#26B290")): Int {
    if (hex.isNullOrBlank()) return fallback
    return try {
      Color.parseColor(hex)
    } catch (_: IllegalArgumentException) {
      fallback
    }
  }

  /**
   * Produces an opaque pastel surface tint in light mode (or deep tinted dark
   * surface in night mode) matching Papillon's in-app Course / CompactGrade cards.
   */
  fun softCardTint(hex: String?, isNight: Boolean, ratio: Float = if (isNight) 0.22f else 0.16f): Int {
    val base = if (isNight) Color.parseColor("#1C1C1E") else Color.WHITE
    val subject = parseColorSafe(hex)
    return blendColors(base, subject, ratio)
  }

  /**
   * Adjusts subject color luminance to keep text and accent pills legible against
   * the widget card surface in both light and dark modes.
   */
  fun readableSubjectColor(hex: String?, isNight: Boolean): Int {
    val subject = parseColorSafe(hex)
    val target = if (isNight) Color.WHITE else Color.BLACK
    val factor = if (isNight) 0.28f else 0.32f
    return blendColors(subject, target, factor)
  }

  private fun blendColors(from: Int, to: Int, ratio: Float): Int {
    val clamped = ratio.coerceIn(0f, 1f)
    val inverse = 1f - clamped
    val r = (Color.red(from) * inverse + Color.red(to) * clamped).roundToInt().coerceIn(0, 255)
    val g = (Color.green(from) * inverse + Color.green(to) * clamped).roundToInt().coerceIn(0, 255)
    val b = (Color.blue(from) * inverse + Color.blue(to) * clamped).roundToInt().coerceIn(0, 255)
    return Color.rgb(r, g, b)
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
