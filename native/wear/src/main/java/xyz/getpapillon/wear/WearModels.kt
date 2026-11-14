package xyz.getpapillon.wear

import androidx.compose.ui.graphics.Color
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

data class WearCourse(
  val id: String,
  val subject: String,
  val room: String?,
  val teacher: String?,
  val color: String,
  val from: Long,
  val to: Long,
  val isCanceled: Boolean,
)

data class WearGrade(
  val id: String,
  val subject: String,
  val description: String,
  val score: String,
  val outOf: String,
  val color: String,
  val date: Long,
)

data class WearTask(
  val id: String,
  val subject: String,
  val description: String,
  val color: String,
  val dueDate: Long,
  val isDone: Boolean,
)

data class WearCanteenCard(
  val id: String,
  val label: String,
  val serviceName: String,
  val balanceText: String?,
  val qrData: String?,
  val qrType: String?,
)

data class WearSnapshot(
  val updatedAt: Long = 0L,
  val accountName: String? = null,
  val overallAverage: String? = null,
  val nextClasses: List<WearCourse> = emptyList(),
  val latestGrades: List<WearGrade> = emptyList(),
  val tasks: List<WearTask> = emptyList(),
  val canteenCards: List<WearCanteenCard> = emptyList(),
)

fun parseWearSnapshot(jsonString: String): WearSnapshot {
  return try {
    val root = JSONObject(jsonString)
    WearSnapshot(
      updatedAt = root.optLong("updatedAt", 0L),
      accountName = root.optString("accountName").takeIf { it.isNotEmpty() && it != "null" },
      overallAverage = root.optString("overallAverage").takeIf { it.isNotEmpty() && it != "null" },
      nextClasses = parseCourses(root.optJSONArray("nextClasses")),
      latestGrades = parseGrades(root.optJSONArray("latestGrades")),
      tasks = parseTasks(root.optJSONArray("tasks")),
      canteenCards = parseCanteenCards(root.optJSONArray("canteenCards")),
    )
  } catch (_: Throwable) {
    WearSnapshot()
  }
}

private fun parseCourses(array: JSONArray?): List<WearCourse> {
  if (array == null) return emptyList()
  val list = mutableListOf<WearCourse>()
  for (i in 0 until array.length()) {
    val obj = array.optJSONObject(i) ?: continue
    list.add(
      WearCourse(
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
  return list
}

private fun parseGrades(array: JSONArray?): List<WearGrade> {
  if (array == null) return emptyList()
  val list = mutableListOf<WearGrade>()
  for (i in 0 until array.length()) {
    val obj = array.optJSONObject(i) ?: continue
    list.add(
      WearGrade(
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
  return list
}

private fun parseTasks(array: JSONArray?): List<WearTask> {
  if (array == null) return emptyList()
  val list = mutableListOf<WearTask>()
  for (i in 0 until array.length()) {
    val obj = array.optJSONObject(i) ?: continue
    list.add(
      WearTask(
        id = obj.optString("id"),
        subject = obj.optString("subject"),
        description = obj.optString("description"),
        color = obj.optString("color", "#29947A"),
        dueDate = obj.optLong("dueDate", 0L),
        isDone = obj.optBoolean("isDone", false),
      )
    )
  }
  return list
}

private fun parseCanteenCards(array: JSONArray?): List<WearCanteenCard> {
  if (array == null) return emptyList()
  val list = mutableListOf<WearCanteenCard>()
  for (i in 0 until array.length()) {
    val obj = array.optJSONObject(i) ?: continue
    list.add(
      WearCanteenCard(
        id = obj.optString("id"),
        label = obj.optString("label"),
        serviceName = obj.optString("serviceName"),
        balanceText = obj.optString("balanceText").takeIf { it.isNotEmpty() && it != "null" },
        qrData = obj.optString("qrData").takeIf { it.isNotEmpty() && it != "null" },
        qrType = obj.optString("qrType").takeIf { it.isNotEmpty() && it != "null" },
      )
    )
  }
  return list
}

fun parseComposeColor(hex: String?, fallback: Color = Color(0xFF29947A)): Color {
  if (hex.isNullOrBlank()) return fallback
  return try {
    Color(android.graphics.Color.parseColor(hex))
  } catch (_: IllegalArgumentException) {
    fallback
  }
}

private val TIME_FORMAT = ThreadLocal.withInitial {
  SimpleDateFormat("HH:mm", Locale.getDefault())
}

private val SHORT_DATE_FORMAT = ThreadLocal.withInitial {
  SimpleDateFormat("dd/MM", Locale.getDefault())
}

private val DUE_DATE_FORMAT = ThreadLocal.withInitial {
  SimpleDateFormat("EEE dd/MM", Locale.FRENCH)
}

fun formatWearTimeRange(fromMs: Long, toMs: Long): String {
  val formatter = TIME_FORMAT.get()!!
  return "${formatter.format(Date(fromMs))} - ${formatter.format(Date(toMs))}"
}

fun formatWearDueDate(dateMs: Long): String {
  if (dateMs <= 0L) return ""
  val target = Calendar.getInstance().apply { timeInMillis = dateMs }
  val today = Calendar.getInstance()
  val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 1) }

  return when {
    isSameDay(target, today) -> "Aujourd'hui"
    isSameDay(target, tomorrow) -> "Demain"
    else -> DUE_DATE_FORMAT.get()!!.format(Date(dateMs))
  }
}

fun formatWearShortDate(dateMs: Long): String {
  if (dateMs <= 0L) return ""
  return SHORT_DATE_FORMAT.get()!!.format(Date(dateMs))
}

private fun isSameDay(a: Calendar, b: Calendar): Boolean {
  return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) &&
    a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)
}
