package xyz.getpapillon.wear

import android.content.Context
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object WearRepository {
  private const val PREFS_NAME = "papillon_wear_cache"
  private const val KEY_PAYLOAD = "payload_json"
  private const val REQUEST_SYNC_PATH = "/papillon/request_sync"

  private val _snapshot = MutableStateFlow(WearSnapshot())
  val snapshot: StateFlow<WearSnapshot> = _snapshot.asStateFlow()

  private var initialized = false

  fun init(context: Context) {
    if (initialized) return
    initialized = true
    val cached = context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(KEY_PAYLOAD, null)
    if (!cached.isNullOrBlank()) {
      _snapshot.value = parseWearSnapshot(cached)
    }
  }

  fun updateFromJson(context: Context, jsonString: String) {
    context.applicationContext
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PAYLOAD, jsonString)
      .apply()
    _snapshot.value = parseWearSnapshot(jsonString)
  }

  fun requestSyncFromPhone(context: Context) {
    try {
      val appContext = context.applicationContext
      Wearable.getNodeClient(appContext).connectedNodes
        .addOnSuccessListener { nodes ->
          val messageClient = Wearable.getMessageClient(appContext)
          for (node in nodes) {
            messageClient.sendMessage(node.id, REQUEST_SYNC_PATH, ByteArray(0))
          }
        }
    } catch (_: Throwable) {
      // Safe fallback if Wearable APIs are unavailable on emulator/device
    }
  }
}
