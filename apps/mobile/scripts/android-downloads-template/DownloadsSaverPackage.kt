package vip.chi_chi.purrivacy.downloads

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DownloadsSaverPackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            DownloadsSaverModule.MODULE_NAME -> DownloadsSaverModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                DownloadsSaverModule.MODULE_NAME to
                    ReactModuleInfo(
                        DownloadsSaverModule.MODULE_NAME,
                        DownloadsSaverModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
