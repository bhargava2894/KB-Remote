package expo.modules.atvcert

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

private class TlsBadBase64Exception :
  CodedException("ERR_BAD_BASE64", "Bad base64 input", null)

private class TlsImportFailedException(cause: Throwable) :
  CodedException("ERR_IMPORT_FAILED", "PKCS#12 import failed: ${cause.message}", cause)

private class NoConnectionException :
  CodedException("ERR_NO_CONNECTION", "Unknown connection ID", null)

private class ConnectionHolder(
  val socket: SSLSocket,
  val peerCertBytes: ByteArray?
) {
  @Volatile var alive: Boolean = true
}

class AtvTlsModule : Module() {
  private val connections = ConcurrentHashMap<String, ConnectionHolder>()
  private val ioExecutor = Executors.newCachedThreadPool()

  override fun definition() = ModuleDefinition {
    Name("AtvTls")

    Events("data", "connect", "close", "error")

    AsyncFunction("connect") { connectionId: String, host: String, port: Int, p12Base64: String, password: String ->
      val p12Bytes = try {
        Base64.decode(p12Base64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw TlsBadBase64Exception()
      }

      val keyStore = KeyStore.getInstance("PKCS12")
      try {
        keyStore.load(ByteArrayInputStream(p12Bytes), password.toCharArray())
      } catch (e: Exception) {
        throw TlsImportFailedException(e)
      }

      val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
      kmf.init(keyStore, password.toCharArray())

      val peerCertSlot = arrayOfNulls<ByteArray>(1)

      val trustAll = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
          chain?.firstOrNull()?.let { peerCertSlot[0] = it.encoded }
        }
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
      }

      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(kmf.keyManagers, arrayOf(trustAll), SecureRandom())

      ioExecutor.execute {
        val socket: SSLSocket = try {
          (sslContext.socketFactory.createSocket(host, port) as SSLSocket).apply {
            startHandshake()
          }
        } catch (e: Exception) {
          android.util.Log.w("AtvTls", "Handshake failed: ${e.message}")
          sendEvent("error", mapOf(
            "connectionId" to connectionId,
            "message" to (e.message ?: "TLS handshake failed")
          ))
          return@execute
        }

        val peerCert = peerCertSlot[0]

        // Port 6467 (pairing) must have a captured peer cert; matches iOS verify-block behavior.
        if (peerCert == null && port == 6467) {
          try { socket.close() } catch (_: Exception) {}
          sendEvent("error", mapOf(
            "connectionId" to connectionId,
            "message" to "TV public key unavailable for pairing"
          ))
          return@execute
        }

        val holder = ConnectionHolder(socket, peerCert)
        connections[connectionId] = holder

        sendEvent("connect", mapOf(
          "connectionId" to connectionId,
          "peerCertBase64" to (peerCert?.let { Base64.encodeToString(it, Base64.NO_WRAP) } ?: "")
        ))

        ioExecutor.execute {
          val input = socket.inputStream
          val buf = ByteArray(65536)
          try {
            while (holder.alive) {
              val n = input.read(buf)
              if (n < 0) {
                sendEvent("close", mapOf("connectionId" to connectionId))
                connections.remove(connectionId)
                return@execute
              }
              if (n > 0) {
                val data = buf.copyOf(n)
                sendEvent("data", mapOf(
                  "connectionId" to connectionId,
                  "dataBase64" to Base64.encodeToString(data, Base64.NO_WRAP)
                ))
              }
            }
          } catch (e: Exception) {
            if (holder.alive) {
              sendEvent("error", mapOf(
                "connectionId" to connectionId,
                "message" to (e.message ?: "I/O error")
              ))
            }
            connections.remove(connectionId)
          }
        }
      }
    }

    AsyncFunction("send") { connectionId: String, dataBase64: String ->
      val holder = connections[connectionId] ?: throw NoConnectionException()
      val bytes = try {
        Base64.decode(dataBase64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw TlsBadBase64Exception()
      }
      ioExecutor.execute {
        try {
          val out = holder.socket.outputStream
          out.write(bytes)
          out.flush()
        } catch (e: Exception) {
          if (holder.alive) {
            sendEvent("error", mapOf(
              "connectionId" to connectionId,
              "message" to (e.message ?: "Send failed")
            ))
          }
        }
      }
    }

    AsyncFunction("close") { connectionId: String ->
      val holder = connections.remove(connectionId) ?: return@AsyncFunction
      holder.alive = false
      try { holder.socket.close() } catch (_: Exception) {}
    }
  }
}
