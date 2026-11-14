package expo.modules.papillonandroidwidgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
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
  val overallAverageValue: String?,
  val overallAverageScale: String?,
  val overallAverageSubtitle: String?,
  val averageHistory: List<Float>,
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
        overallAverageValue = root.optString("overallAverageValue").takeIf { it.isNotEmpty() && it != "null" },
        overallAverageScale = root.optString("overallAverageScale").takeIf { it.isNotEmpty() && it != "null" },
        overallAverageSubtitle = root.optString("overallAverageSubtitle").takeIf { it.isNotEmpty() && it != "null" },
        averageHistory = parseAverageHistory(root.optJSONArray("averageHistory")),
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
   * Mirrors utils/adjustColor.ts: blends toward black when percent < 0
   * or toward white when percent > 0.
   */
  fun adjustColor(
    hex: String?,
    percent: Float,
    fallback: Int = Color.parseColor("#26B290"),
  ): Int {
    val base = parseColorSafe(hex, fallback)
    val target = if (percent < 0f) 0 else 255
    val p = kotlin.math.abs(percent).coerceIn(0f, 1f)
    val r = (Color.red(base) + (target - Color.red(base)) * p).roundToInt().coerceIn(0, 255)
    val g = (Color.green(base) + (target - Color.green(base)) * p).roundToInt().coerceIn(0, 255)
    val b = (Color.blue(base) + (target - Color.blue(base)) * p).roundToInt().coerceIn(0, 255)
    return Color.rgb(r, g, b)
  }

  fun withAlpha(color: Int, alphaFraction: Float): Int {
    val alpha = (alphaFraction.coerceIn(0f, 1f) * 255f).roundToInt().coerceIn(0, 255)
    return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
  }

  fun softCardTint(hex: String?, isNight: Boolean, ratio: Float = if (isNight) 0.22f else 0.16f): Int {
    val base = if (isNight) Color.parseColor("#121212") else Color.WHITE
    val subject = parseColorSafe(hex)
    return blendColors(base, subject, ratio)
  }

  fun readableSubjectColor(hex: String?, isNight: Boolean): Int {
    return adjustColor(hex, if (isNight) 0.20f else -0.25f)
  }

  private fun blendColors(from: Int, to: Int, ratio: Float): Int {
    val clamped = ratio.coerceIn(0f, 1f)
    val inverse = 1f - clamped
    val r = (Color.red(from) * inverse + Color.red(to) * clamped).roundToInt().coerceIn(0, 255)
    val g = (Color.green(from) * inverse + Color.green(to) * clamped).roundToInt().coerceIn(0, 255)
    val b = (Color.blue(from) * inverse + Color.blue(to) * clamped).roundToInt().coerceIn(0, 255)
    return Color.rgb(r, g, b)
  }

  fun dayKey(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(timeMs))
  }

  fun formatHourMinute(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timeMs))
  }

  fun formatDuration(fromMs: Long, toMs: Long): String {
    val totalMinutes = ((toMs - fromMs) / 60000L).toInt().coerceAtLeast(0)
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return when {
      hours > 0 && minutes > 0 -> "${hours}h ${minutes} min"
      hours > 0 -> "${hours}h"
      else -> "${minutes} min"
    }
  }

  private fun calendarDayDelta(targetMs: Long): Int {
    val today = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val target = Calendar.getInstance().apply {
      timeInMillis = targetMs
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    return ((target.timeInMillis - today.timeInMillis) / 86_400_000.0).roundToInt()
  }

  fun formatRelativeDayTitle(firstCourseMs: Long): String {
    if (firstCourseMs <= 0L) return "Prochains cours"
    return when (val days = calendarDayDelta(firstCourseMs)) {
      in Int.MIN_VALUE..0 -> "Aujourd'hui"
      1 -> "Demain"
      else -> "Dans $days jours"
    }
  }

  fun formatRelativeDistanceDay(dateMs: Long): String {
    if (dateMs <= 0L) return ""
    return when (val days = calendarDayDelta(dateMs)) {
      -1 -> "hier"
      0 -> "aujourd'hui"
      1 -> "demain"
      in 2..Int.MAX_VALUE -> "dans $days jours"
      else -> "il y a ${-days} jours"
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
    return formatRelativeDistanceDay(dateMs)
  }

  private fun parseAverageHistory(array: JSONArray?): List<Float> {
    if (array == null) return emptyList()
    val values = mutableListOf<Float>()
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      val v = obj.optDouble("value", Double.NaN)
      if (!v.isNaN() && !v.isInfinite()) {
        values.add(v.toFloat())
      }
    }
    return values
  }

  fun renderAverageGraphBitmap(
    points: List<Float>,
    accentColor: Int,
    widthPx: Int = 340,
    heightPx: Int = 180,
  ): Bitmap {
    val bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val series = when {
      points.size >= 2 -> points
      points.size == 1 -> listOf(points[0], points[0])
      else -> return bmp
    }

    val minVal = series.minOrNull() ?: 0f
    val maxVal = series.maxOrNull() ?: 20f
    val span = (maxVal - minVal).takeIf { it > 0.05f } ?: 1f

    val leftPad = 10f
    val rightPad = 24f
    val topPad = 22f
    val bottomPad = 22f
    val drawW = (widthPx - leftPad - rightPad).coerceAtLeast(1f)
    val drawH = (heightPx - topPad - bottomPad).coerceAtLeast(1f)

    val coords = series.mapIndexed { idx, value ->
      val x = leftPad + (idx.toFloat() / (series.size - 1).coerceAtLeast(1)) * drawW
      val norm = ((value - minVal) / span).coerceIn(0f, 1f)
      val y = topPad + (1f - norm) * drawH
      x to y
    }

    val linePath = Path()
    val fillPath = Path()
    val first = coords.first()
    linePath.moveTo(first.first, first.second)
    fillPath.moveTo(first.first, heightPx.toFloat())
    fillPath.lineTo(first.first, first.second)

    for (i in 1 until coords.size) {
      val prev = coords[i - 1]
      val curr = coords[i]
      val midX = (prev.first + curr.first) / 2f
      linePath.cubicTo(midX, prev.second, midX, curr.second, curr.first, curr.second)
      fillPath.cubicTo(midX, prev.second, midX, curr.second, curr.first, curr.second)
    }

    val last = coords.last()
    fillPath.lineTo(last.first, heightPx.toFloat())
    fillPath.close()

    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      shader = LinearGradient(
        0f,
        topPad,
        0f,
        heightPx.toFloat(),
        withAlpha(accentColor, 0.28f),
        Color.TRANSPARENT,
        Shader.TileMode.CLAMP
      )
    }
    canvas.drawPath(fillPath, fillPaint)

    val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 7f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
      color = accentColor
    }
    canvas.drawPath(linePath, strokePaint)

    val outerDotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = Color.WHITE
    }
    val innerDotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.FILL
      color = accentColor
    }
    canvas.drawCircle(last.first, last.second, 12.5f, outerDotPaint)
    canvas.drawCircle(last.first, last.second, 8f, innerDotPaint)

    return bmp
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
