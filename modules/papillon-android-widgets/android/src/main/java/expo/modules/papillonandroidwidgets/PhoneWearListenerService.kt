package expo.modules.papillonandroidwidgets

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class PhoneWearListenerService : WearableListenerService() {
  override fun onMessageReceived(messageEvent: MessageEvent) {
    if (messageEvent.path == WearDataLayerSync.REQUEST_SYNC_PATH) {
      val cachedJson = WidgetStore.readRawJson(applicationContext) ?: return
      WearDataLayerSync.publishSnapshot(applicationContext, cachedJson)
    }
  }
}
