package expo.modules.papillonandroidwidgets

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class PhoneWearListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    when (messageEvent.path) {
      WearDataLayerSync.REQUEST_SYNC_PATH -> {
        val cachedJson = WidgetStore.readRawJson(applicationContext) ?: return
        WearDataLayerSync.publishSnapshot(applicationContext, cachedJson)
      }
      WearDataLayerSync.TOGGLE_TASK_PATH -> {
        val raw = String(messageEvent.data ?: ByteArray(0), Charsets.UTF_8)
        if (raw.isBlank()) return
        try {
          val json = JSONObject(raw)
          val taskId = json.optString("id")
          if (taskId.isBlank()) return
          val isDone = json.optBoolean("isDone", true)
          val updatedJson = WidgetStore.recordPendingWearToggleAndUpdateSnapshot(
            applicationContext,
            taskId,
            isDone
          )
          WidgetUpdater.updateAll(applicationContext)
          if (updatedJson != null) {
            WearDataLayerSync.publishSnapshot(applicationContext, updatedJson)
          }
        } catch (_: Throwable) {
        }
      }
    }
  }
}
