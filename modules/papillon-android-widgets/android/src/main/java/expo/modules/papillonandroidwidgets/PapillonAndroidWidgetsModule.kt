package expo.modules.papillonandroidwidgets

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PapillonAndroidWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PapillonAndroidWidgets")

    AsyncFunction("syncWidgetsSnapshot") { jsonPayload: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      WidgetStore.saveSnapshot(context, jsonPayload)
      WidgetUpdater.updateAll(context)
      WearDataLayerSync.publishSnapshot(context, jsonPayload)
      true
    }

    AsyncFunction("reloadWidgets") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      WidgetUpdater.updateAll(context)
      true
    }
  }
}
