package expo.modules.atvdiscovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

private const val SERVICE_TYPE = "_androidtvremote2._tcp."

private class NoContextException :
  CodedException("ERR_NO_CONTEXT", "Android Context unavailable", null)

class AtvDiscoveryModule : Module() {
  private val nsdManager: NsdManager by lazy {
    val context = appContext.reactContext ?: throw NoContextException()
    context.getSystemService(Context.NSD_SERVICE) as NsdManager
  }

  private var discoveryListener: NsdManager.DiscoveryListener? = null
  private val resolved = ConcurrentHashMap<String, NsdServiceInfo>()

  override fun definition() = ModuleDefinition {
    Name("AtvDiscovery")

    Events("serviceFound", "serviceLost")

    AsyncFunction("startDiscovery") {
      stopDiscoveryInternal()

      val listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
          android.util.Log.i("AtvDiscovery", "discovery started")
        }

        override fun onDiscoveryStopped(serviceType: String) {
          android.util.Log.i("AtvDiscovery", "discovery stopped")
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
          android.util.Log.w("AtvDiscovery", "startDiscovery failed: $errorCode")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
          android.util.Log.w("AtvDiscovery", "stopDiscovery failed: $errorCode")
        }

        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
          resolveService(serviceInfo)
        }

        override fun onServiceLost(serviceInfo: NsdServiceInfo) {
          val name = serviceInfo.serviceName
          resolved.remove(name)
          sendEvent("serviceLost", mapOf("name" to name))
        }
      }

      nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
      discoveryListener = listener
    }

    AsyncFunction("stopDiscovery") {
      stopDiscoveryInternal()
    }
  }

  private fun stopDiscoveryInternal() {
    discoveryListener?.let {
      try {
        nsdManager.stopServiceDiscovery(it)
      } catch (_: Exception) {
        // already stopped
      }
    }
    discoveryListener = null
    resolved.clear()
  }

  private fun resolveService(info: NsdServiceInfo) {
    val name = info.serviceName
    if (resolved.containsKey(name)) return

    val resolveListener = object : NsdManager.ResolveListener {
      override fun onResolveFailed(failed: NsdServiceInfo, errorCode: Int) {
        android.util.Log.w("AtvDiscovery", "resolve failed: $errorCode for ${failed.serviceName}")
      }

      override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
        val host = resolvedInfo.host?.hostAddress ?: return
        resolved[name] = resolvedInfo
        sendEvent("serviceFound", mapOf(
          "name" to name,
          "host" to host,
          "port" to resolvedInfo.port,
        ))
      }
    }

    try {
      nsdManager.resolveService(info, resolveListener)
    } catch (e: IllegalArgumentException) {
      android.util.Log.w("AtvDiscovery", "resolve already in flight: ${e.message}")
    }
  }
}
