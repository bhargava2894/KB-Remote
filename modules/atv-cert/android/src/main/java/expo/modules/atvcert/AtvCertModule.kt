package expo.modules.atvcert

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.KeyStore

private const val PREFS_NAME = "atv_cert_store"

private class BadBase64Exception :
  CodedException("ERR_BAD_BASE64", "PKCS#12 base64 decode failed", null)

private class ImportFailedException(cause: Throwable) :
  CodedException("ERR_IMPORT_FAILED", "PKCS#12 import failed: ${cause.message}", cause)

private class NoIdentityException :
  CodedException("ERR_NO_IDENTITY", "PKCS#12 imported but contained no identity", null)

private class VerifyFailedException :
  CodedException("ERR_VERIFY_FAILED", "Identity lookup by alias after install failed", null)

private class NoContextException :
  CodedException("ERR_NO_CONTEXT", "Android Context unavailable", null)

class AtvCertModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AtvCert")

    AsyncFunction("installIdentity") { p12Base64: String, password: String, alias: String ->
      val context: Context = appContext.reactContext ?: throw NoContextException()

      val p12Bytes = try {
        Base64.decode(p12Base64, Base64.DEFAULT)
      } catch (e: IllegalArgumentException) {
        throw BadBase64Exception()
      }

      val keyStore = KeyStore.getInstance("PKCS12")
      try {
        keyStore.load(ByteArrayInputStream(p12Bytes), password.toCharArray())
      } catch (e: Exception) {
        throw ImportFailedException(e)
      }

      val hasIdentity = keyStore.aliases().toList().any { keyStore.isKeyEntry(it) }
      if (!hasIdentity) throw NoIdentityException()

      val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

      val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )

      val payload = JSONObject().apply {
        put("p12Base64", p12Base64)
        put("password", password)
      }
      prefs.edit().putString(alias, payload.toString()).apply()

      if (prefs.getString(alias, null) == null) throw VerifyFailedException()

      android.util.Log.i("AtvCert", "Installed identity alias=$alias bytes=${p12Bytes.size}")
      true
    }
  }
}
