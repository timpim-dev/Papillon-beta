package xyz.getpapillon.wear

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
  val complicationMetric: String = DEFAULT_METRIC
) {
  companion object {
    val ALL_SECTIONS = listOf("classes", "tasks", "grades", "canteen")
    val DEFAULT_SECTIONS = ALL_SECTIONS
    const val DEFAULT_METRIC = "next_class"

    fun fromJson(obj: JSONObject?): WearConfig {
      if (obj == null) return WearConfig()
      val syncGradient = obj.optBoolean("syncThemeGradient", true)
      val metric = obj.optString("complicationMetric", DEFAULT_METRIC).ifBlank { DEFAULT_METRIC }
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
        complicationMetric = metric
      )
    }
  }
}

data class WearLocalPreferences(
  val useCustomOverride: Boolean = false,
  val syncThemeGradient: Boolean = true,
  val enabledSections: List<String> = WearConfig.DEFAULT_SECTIONS,
  val complicationMetric: String = WearConfig.DEFAULT_METRIC
)

data class WearSnapshot(
  val updatedAt: Long,
  val accountName: String?,
  val themeColor: String?,
  val wallpaperGradientColors: List<String>,
  val wearConfig: WearConfig,
  val overallAverage: String?,
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
          overallAverage = root.optNullableString("overallAverage"),
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
