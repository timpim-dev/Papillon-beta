package xyz.getpapillon.wear

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

data class WearCourse(
  val id: String,
  val subject: String,
  val emoji: String?,
  val room: String?,
  val teacher: String?,
  val color: String?,
  val from: Long,
  val to: Long,
  val isCanceled: Boolean
)

data class WearGrade(
  val id: String,
  val subject: String,
  val emoji: String?,
  val description: String,
  val score: String,
  val outOf: String,
  val color: String?,
  val date: Long
)

data class WearTask(
  val id: String,
  val subject: String,
  val emoji: String?,
  val description: String,
  val color: String?,
  val dueDate: Long,
  val isDone: Boolean
)

data class WearCanteenCard(
  val id: String,
  val label: String,
  val serviceName: String,
  val balanceText: String,
  val qrData: String?,
  val qrType: String?
)

data class WearConfig(
  val syncThemeGradient: Boolean = true,
  val enabledSections: List<String> = DEFAULT_SECTIONS,
  val complicationMetric: String = DEFAULT_METRIC,
  val tilePreset: String = DEFAULT_TILE_PRESET
) {
  companion object {
    val ALL_SECTIONS = listOf("classes", "tasks", "grades", "canteen")
    val DEFAULT_SECTIONS = ALL_SECTIONS
    const val DEFAULT_METRIC = "next_class"
    const val DEFAULT_TILE_PRESET = "next_2_classes"
    val ALL_TILE_PRESETS = listOf(
      "next_2_classes",
      "next_class_countdown",
      "homework",
      "grade_average",
      "latest_grades",
      "overview"
    )

    fun fromJson(obj: JSONObject?): WearConfig {
      if (obj == null) return WearConfig()
      val syncGradient = obj.optBoolean("syncThemeGradient", true)
      val metric = obj.optString("complicationMetric", DEFAULT_METRIC).ifBlank { DEFAULT_METRIC }
      val rawTilePreset = obj.optString("tilePreset", DEFAULT_TILE_PRESET)
      val tilePreset = if (rawTilePreset in ALL_TILE_PRESETS) rawTilePreset else DEFAULT_TILE_PRESET
      val sectionsArray = obj.optJSONArray("enabledSections")
      val sections = if (sectionsArray == null) {
        DEFAULT_SECTIONS
      } else {
        buildList {
          for (i in 0 until sectionsArray.length()) {
            val section = sectionsArray.optString(i)
            if (section in ALL_SECTIONS && section !in this) {
              add(section)
            }
          }
        }
      }
      return WearConfig(
        syncThemeGradient = syncGradient,
        enabledSections = sections,
        complicationMetric = metric,
        tilePreset = tilePreset
      )
    }
  }
}

data class WearLocalPreferences(
  val useCustomOverride: Boolean = false,
  val syncThemeGradient: Boolean = true,
  val enabledSections: List<String> = WearConfig.DEFAULT_SECTIONS,
  val complicationMetric: String = WearConfig.DEFAULT_METRIC,
  val tilePreset: String = WearConfig.DEFAULT_TILE_PRESET
)

data class WearSnapshot(
  val updatedAt: Long,
  val accountName: String?,
  val themeColor: String?,
  val wallpaperGradientColors: List<String>,
  val wearConfig: WearConfig,
  val equippedBadge: String? = null,
  val overallAverage: String?,
  val overallAverageSubtitle: String?,
  val nextClasses: List<WearCourse>,
  val latestGrades: List<WearGrade>,
  val tasks: List<WearTask>,
  val canteenCards: List<WearCanteenCard>
) {
  fun effectiveSections(prefs: WearLocalPreferences): List<String> {
    return if (prefs.useCustomOverride) prefs.enabledSections else wearConfig.enabledSections
  }

  fun effectiveSyncGradient(prefs: WearLocalPreferences): Boolean {
    return if (prefs.useCustomOverride) prefs.syncThemeGradient else wearConfig.syncThemeGradient
  }

  fun effectiveComplicationMetric(prefs: WearLocalPreferences): String {
    return if (prefs.useCustomOverride) prefs.complicationMetric else wearConfig.complicationMetric
  }

  fun effectiveTilePreset(prefs: WearLocalPreferences): String {
    return if (prefs.useCustomOverride) prefs.tilePreset else wearConfig.tilePreset
  }

  companion object {
    const val RELEASE_PAGE_URL = "https://github.com/timpim-dev/Papillon-beta/releases"

    fun parse(raw: String): WearSnapshot? {
      if (raw.isBlank()) return null
      return try {
        val root = JSONObject(raw)
        val gradientList = parseStringArray(root.optJSONArray("wallpaperGradientColors"))
        WearSnapshot(
          updatedAt = root.optLong("updatedAt", 0L),
          accountName = root.optNullableString("accountName"),
          themeColor = root.optNullableString("themeColor"),
          wallpaperGradientColors = gradientList,
          wearConfig = WearConfig.fromJson(root.optJSONObject("wearConfig")),
          equippedBadge = root.optNullableString("equippedBadge"),
          overallAverage = root.optNullableString("overallAverage"),
          overallAverageSubtitle = root.optNullableString("overallAverageSubtitle"),
          nextClasses = parseArray(root.optJSONArray("nextClasses")) { item ->
            WearCourse(
              id = item.optString("id"),
              subject = item.optString("subject", "Cours"),
              emoji = item.optNullableString("emoji"),
              room = item.optNullableString("room"),
              teacher = item.optNullableString("teacher"),
              color = item.optNullableString("color"),
              from = item.optLong("from", 0L),
              to = item.optLong("to", 0L),
              isCanceled = item.optBoolean("isCanceled", false)
            )
          },
          latestGrades = parseArray(root.optJSONArray("latestGrades")) { item ->
            WearGrade(
              id = item.optString("id"),
              subject = item.optString("subject", "Note"),
              emoji = item.optNullableString("emoji"),
              description = item.optString("description"),
              score = item.optString("score", "--"),
              outOf = item.optString("outOf"),
              color = item.optNullableString("color"),
              date = item.optLong("date", 0L)
            )
          },
          tasks = parseArray(root.optJSONArray("tasks")) { item ->
            WearTask(
              id = item.optString("id"),
              subject = item.optString("subject", "Devoir"),
              emoji = item.optNullableString("emoji"),
              description = item.optString("description"),
              color = item.optNullableString("color"),
              dueDate = item.optLong("dueDate", 0L),
              isDone = item.optBoolean("isDone", false)
            )
          },
          canteenCards = parseArray(root.optJSONArray("canteenCards")) { item ->
            WearCanteenCard(
              id = item.optString("id"),
              label = item.optString("label", "Cantine"),
              serviceName = item.optString("serviceName", "Cantine"),
              balanceText = item.optString("balanceText", "0.00 €"),
              qrData = item.optNullableString("qrData"),
              qrType = item.optNullableString("qrType")
            )
          }
        )
      } catch (_: Throwable) {
        null
      }
    }

    private fun parseStringArray(array: JSONArray?): List<String> {
      if (array == null) return emptyList()
      return buildList {
        for (i in 0 until array.length()) {
          val value = array.optString(i)
          if (value.isNotBlank()) add(value)
        }
      }
    }

    private inline fun <T> parseArray(array: JSONArray?, transform: (JSONObject) -> T): List<T> {
      if (array == null) return emptyList()
      return buildList {
        for (i in 0 until array.length()) {
          val item = array.optJSONObject(i) ?: continue
          add(transform(item))
        }
      }
    }

    private fun JSONObject.optNullableString(key: String): String? {
      if (!has(key) || isNull(key)) return null
      val value = optString(key)
      return value.takeIf { it.isNotBlank() && it != "null" }
    }
  }
}

object WearFormatters {
  fun parseColorInt(raw: String?, fallback: Int): Int {
    if (raw.isNullOrBlank()) return fallback
    return try {
      Color.parseColor(raw.trim())
    } catch (_: Throwable) {
      fallback
    }
  }

  /**
   * Mirrors utils/adjustColor.ts: blends toward black when percent < 0
   * or toward white when percent > 0.
   */
  fun adjustColor(raw: String?, percent: Float, fallback: Int): Int {
    val base = parseColorInt(raw, fallback)
    val target = if (percent < 0f) 0 else 255
    val p = abs(percent).coerceIn(0f, 1f)
    val r = (Color.red(base) + (target - Color.red(base)) * p).roundToInt().coerceIn(0, 255)
    val g = (Color.green(base) + (target - Color.green(base)) * p).roundToInt().coerceIn(0, 255)
    val b = (Color.blue(base) + (target - Color.blue(base)) * p).roundToInt().coerceIn(0, 255)
    return Color.rgb(r, g, b)
  }

  fun dayKey(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(timeMs))
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

  fun formatDaySectionHeader(timeMs: Long): String {
    if (timeMs <= 0L) return "Date inconnue"
    val locale = Locale.getDefault()
    return when (calendarDayDelta(timeMs)) {
      -1 -> "Hier"
      0 -> "Aujourd'hui"
      1 -> "Demain"
      else -> SimpleDateFormat("EEEE d MMM", locale)
        .format(Date(timeMs))
        .replaceFirstChar { ch ->
          if (ch.isLowerCase()) ch.titlecase(locale) else ch.toString()
        }
    }
  }

  fun formatShortDayChip(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    val locale = Locale.getDefault()
    return SimpleDateFormat("EEE d", locale)
      .format(Date(timeMs))
      .replace(".", "")
      .replaceFirstChar { ch ->
        if (ch.isLowerCase()) ch.titlecase(locale) else ch.toString()
      }
  }

  fun formatRelativeDue(dateMs: Long): String {
    if (dateMs <= 0L) return ""
    return when (val days = calendarDayDelta(dateMs)) {
      -1 -> "Hier"
      0 -> "Aujourd'hui"
      1 -> "Demain"
      in 2..Int.MAX_VALUE -> "Dans $days jours"
      else -> "Il y a ${-days} jours"
    }
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

  fun formatCountdown(
    courseFromMs: Long,
    courseToMs: Long,
    nowMs: Long = System.currentTimeMillis()
  ): String {
    if (courseFromMs <= 0L) return ""
    return if (nowMs < courseFromMs) {
      val mins = ((courseFromMs - nowMs) / 60000L).toInt().coerceAtLeast(1)
      val hours = mins / 60
      val rem = mins % 60
      when {
        hours >= 24 -> formatRelativeDue(courseFromMs)
        hours > 0 && rem > 0 -> "Dans ${hours}h $rem"
        hours > 0 -> "Dans ${hours}h"
        else -> "Dans $mins min"
      }
    } else if (courseToMs > nowMs) {
      val leftMins = ((courseToMs - nowMs) / 60000L).toInt().coerceAtLeast(1)
      val hours = leftMins / 60
      val rem = leftMins % 60
      if (hours > 0) {
        "En cours (${hours}h${if (rem > 0) " $rem" else ""})"
      } else {
        "En cours ($leftMins min)"
      }
    } else {
      "Terminé"
    }
  }

  fun formatHour(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timeMs))
  }

  fun formatTimeRange(fromMs: Long, toMs: Long): String {
    if (fromMs <= 0L) return ""
    val fmt = SimpleDateFormat("HH:mm", Locale.getDefault())
    val start = fmt.format(Date(fromMs))
    val end = if (toMs > fromMs) fmt.format(Date(toMs)) else ""
    return if (end.isNotEmpty()) "$start – $end" else start
  }

  fun formatShortDate(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(Date(timeMs))
  }

  fun formatFullDateTime(timeMs: Long): String {
    if (timeMs <= 0L) return ""
    return SimpleDateFormat("EEEE d MMMM", Locale.getDefault()).format(Date(timeMs))
  }
}
