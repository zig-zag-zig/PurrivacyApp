package vip.chi_chi.purrivacy.secureStorage

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SecureStoragePackage : BaseReactPackage() {
    override fun getModule(
        name: String,
        reactContext: ReactApplicationContext,
    ): NativeModule? =
        when (name) {
            SecureStorageModule.MODULE_NAME -> SecureStorageModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
        ReactModuleInfoProvider {
            mapOf(
                SecureStorageModule.MODULE_NAME to
                    ReactModuleInfo(
                        SecureStorageModule.MODULE_NAME,
                        SecureStorageModule::class.java.name,
                        false,
                        false,
                        false,
                        false,
                    ),
            )
        }
}
