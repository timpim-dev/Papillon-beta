package xyz.getpapillon.wear

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.io.File

object WearRepository {
  const val SYNC_PATH = "/papillon/sync"
  const val REQUEST_SYNC_PATH = "/papillon/request_sync"
  const val TOGGLE_TASK_PATH = "/papillon/toggle_task"
  const val APK_UPDATE_CHANNEL_PATH = "/papillon/apk_update"

  private const val PREFS_NAME = "papillon_wear_store"
  private const val KEY_RAW_SNAPSHOT = "raw_snapshot"
  private const val KEY_OVERRIDE_ENABLED = "pref_override_enabled"
  private const val KEY_SYNC_GRADIENT = "pref_sync_gradient"
  private const val KEY_SECTIONS_CSV = "pref_sections_csv"
  private const val KEY_COMPLICATION_METRIC = "pref_complication_metric"
  private const val KEY_TILE_PRESET = "pref_tile_preset"
  private const val KEY_PENDING_APK_PATH = "pending_apk_path"

  private val _snapshot = MutableStateFlow<WearSnapshot?>(null)
  val snapshot: StateFlow<WearSnapshot?> = _snapshot.asStateFlow()

  private val _isSyncing = MutableStateFlow(false)
  val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

  private val _localPreferences = MutableStateFlow(WearLocalPreferences())
  val localPreferences: StateFlow<WearLocalPreferences> = _localPreferences.asStateFlow()

  private val _pendingApkPath = MutableStateFlow<String?>(null)
  val pendingApkPath: StateFlow<String?> = _pendingApkPath.asStateFlow()

  fun loadCached(context: Context): WearSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val localPrefs = WearLocalPreferences(
      useCustomOverride = prefs.getBoolean(KEY_OVERRIDE_ENABLED, false),
      syncThemeGradient = prefs.getBoolean(KEY_SYNC_GRADIENT, true),
      enabledSections = prefs.getString(KEY_SECTIONS_CSV, null)
        ?.split(",")
        ?.map { it.trim() }
        ?.filter { it in WearConfig.ALL_SECTIONS }
        ?.takeIf { it.isNotEmpty() || prefs.contains(KEY_SECTIONS_CSV) }
        ?: WearConfig.DEFAULT_SECTIONS,
      complicationMetric = prefs.getString(KEY_COMPLICATION_METRIC, WearConfig.DEFAULT_METRIC)
        ?: WearConfig.DEFAULT_METRIC,
      tilePreset = prefs.getString(KEY_TILE_PRESET, WearConfig.DEFAULT_TILE_PRESET)
        ?.takeIf { it in WearConfig.ALL_TILE_PRESETS }
        ?: WearConfig.DEFAULT_TILE_PRESET
    )
    _localPreferences.value = localPrefs

    val apkPath = prefs.getString(KEY_PENDING_APK_PATH, null)
    _pendingApkPath.value = apkPath?.takeIf { File(it).exists() }

    val existing = _snapshot.value
    if (existing != null) return existing

    val raw = prefs.getString(KEY_RAW_SNAPSHOT, null) ?: return null
    val parsed = WearSnapshot.parse(raw)
    _snapshot.value = parsed
    return parsed
  }

  fun init(context: Context) {
    loadCached(context)
  }

  fun requestSyncFromPhone(context: Context) {
    requestPhoneSync(context)
  }

  fun saveRawPayload(context: Context, raw: String) {
    val parsed = WearSnapshot.parse(raw) ?: return
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().putString(KEY_RAW_SNAPSHOT, raw).apply()
    _snapshot.value = parsed
    _isSyncing.value = false
    refreshTilesAndComplications(context)
  }

  fun updateLocalPreferences(
    context: Context,
    transform: (WearLocalPreferences) -> WearLocalPreferences
  ) {
    val base = if (!_localPreferences.value.useCustomOverride) {
      val synced = _snapshot.value?.wearConfig ?: WearConfig()
      _localPreferences.value.copy(
        syncThemeGradient = synced.syncThemeGradient,
        enabledSections = synced.enabledSections,
        complicationMetric = synced.complicationMetric,
        tilePreset = synced.tilePreset
      )
    } else {
      _localPreferences.value
    }
    val next = transform(base)
    persistLocalPreferences(context, next)
    _localPreferences.value = next
    refreshTilesAndComplications(context)
  }

  fun resetToPhoneConfig(context: Context) {
    val synced = _snapshot.value?.wearConfig ?: WearConfig()
    val next = WearLocalPreferences(
      useCustomOverride = false,
      syncThemeGradient = synced.syncThemeGradient,
      enabledSections = synced.enabledSections,
      complicationMetric = synced.complicationMetric,
      tilePreset = synced.tilePreset
    )
    persistLocalPreferences(context, next)
    _localPreferences.value = next
    refreshTilesAndComplications(context)
  }

  private fun persistLocalPreferences(context: Context, prefsValue: WearLocalPreferences) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit()
      .putBoolean(KEY_OVERRIDE_ENABLED, prefsValue.useCustomOverride)
      .putBoolean(KEY_SYNC_GRADIENT, prefsValue.syncThemeGradient)
      .putString(KEY_SECTIONS_CSV, prefsValue.enabledSections.joinToString(","))
      .putString(KEY_COMPLICATION_METRIC, prefsValue.complicationMetric)
      .putString(KEY_TILE_PRESET, prefsValue.tilePreset)
      .apply()
  }

  fun toggleTaskDone(context: Context, taskId: String, isDone: Boolean) {
    val current = _snapshot.value ?: loadCached(context)
    if (current != null) {
      val updatedTasks = current.tasks.map { task ->
        if (task.id == taskId) task.copy(isDone = isDone) else task
      }
      _snapshot.value = current.copy(tasks = updatedTasks)
    }

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_RAW_SNAPSHOT, null)
    if (!raw.isNullOrBlank()) {
      try {
        val root = JSONObject(raw)
        val tasksArr = root.optJSONArray("tasks")
        if (tasksArr != null) {
          for (i in 0 until tasksArr.length()) {
            val item = tasksArr.optJSONObject(i) ?: continue
            if (item.optString("id") == taskId) {
              item.put("isDone", isDone)
            }
          }
          prefs.edit().putString(KEY_RAW_SNAPSHOT, root.toString()).apply()
        }
      } catch (_: Throwable) {
      }
    }

    refreshTilesAndComplications(context)

    val payload = JSONObject().apply {
      put("id", taskId)
      put("isDone", isDone)
      put("updatedAt", System.currentTimeMillis())
    }.toString().toByteArray(Charsets.UTF_8)

    try {
      Wearable.getNodeClient(context).connectedNodes
        .addOnSuccessListener { nodes ->
          val msgClient = Wearable.getMessageClient(context)
          for (node in nodes) {
            msgClient.sendMessage(node.id, TOGGLE_TASK_PATH, payload)
          }
        }
    } catch (_: Throwable) {
    }
  }

  fun setPendingApkUpdatePath(context: Context, path: String?) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    if (path.isNullOrBlank()) {
      prefs.edit().remove(KEY_PENDING_APK_PATH).apply()
      _pendingApkPath.value = null
    } else {
      prefs.edit().putString(KEY_PENDING_APK_PATH, path).apply()
      _pendingApkPath.value = path
    }
  }

  fun installPendingApkUpdate(context: Context): Boolean {
    val path = _pendingApkPath.value ?: return false
    val file = File(path)
    if (!file.exists()) {
      setPendingApkUpdatePath(context, null)
      return false
    }
    return try {
      val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.wearupdater.fileprovider",
        file
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (_: Throwable) {
      false
    }
  }

  fun refreshTilesAndComplications(context: Context) {
    try {
      TileService.getUpdater(context).requestUpdate(PapillonTileService::class.java)
    } catch (_: Throwable) {
    }
    try {
      ComplicationDataSourceUpdateRequester
        .create(
          context,
          ComponentName(context, PapillonComplicationService::class.java)
        )
        .requestUpdateAll()
    } catch (_: Throwable) {
    }
  }

  fun requestPhoneSync(context: Context) {
    _isSyncing.value = true

    try {
      Wearable.getDataClient(context).dataItems
        .addOnSuccessListener { buffer ->
          var foundPayload: String? = null
          for (item in buffer) {
            if (item.uri.path == SYNC_PATH) {
              val payload = com.google.android.gms.wearable.DataMapItem.fromDataItem(item)
                .dataMap
                .getString("payload")
              if (!payload.isNullOrBlank()) {
                foundPayload = payload
              }
            }
          }
          buffer.release()
          if (foundPayload != null) {
            saveRawPayload(context, foundPayload)
          }
        }
        .addOnFailureListener {
          _isSyncing.value = false
        }

      Wearable.getNodeClient(context).connectedNodes
        .addOnSuccessListener { nodes ->
          if (nodes.isEmpty()) {
            _isSyncing.value = false
            return@addOnSuccessListener
          }
          val msgClient = Wearable.getMessageClient(context)
          for (node in nodes) {
            msgClient.sendMessage(node.id, REQUEST_SYNC_PATH, ByteArray(0))
          }
        }
        .addOnFailureListener {
          _isSyncing.value = false
        }
    } catch (_: Throwable) {
      _isSyncing.value = false
    }
  }
}
