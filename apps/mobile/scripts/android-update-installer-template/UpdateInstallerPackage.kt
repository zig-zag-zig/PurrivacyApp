package vip.chi_chi.purrivacy.updates

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class UpdateInstallerPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            UpdateInstallerModule.MODULE_NAME -> UpdateInstallerModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                UpdateInstallerModule.MODULE_NAME to
                    ReactModuleInfo(
                        UpdateInstallerModule.MODULE_NAME,
                        UpdateInstallerModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
