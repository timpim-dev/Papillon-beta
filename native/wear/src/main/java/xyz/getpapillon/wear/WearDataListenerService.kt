package xyz.getpapillon.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

class WearDataListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    for (event in dataEvents) {
      if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == "/papillon/sync") {
        val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
        val payload = dataMap.getString("payload") ?: continue
        WearRepository.updateFromJson(applicationContext, payload)
      }
    }
  }
}
