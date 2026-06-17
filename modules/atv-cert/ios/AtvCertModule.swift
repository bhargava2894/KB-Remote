import ExpoModulesCore
import Security
import Foundation

public class AtvCertModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AtvCert")

    AsyncFunction("installIdentity") { (p12Base64: String, password: String, alias: String) -> Bool in
      guard let p12Data = Data(base64Encoded: p12Base64) else {
        throw InstallError.badBase64
      }

      let options: [String: Any] = [kSecImportExportPassphrase as String: password]
      var importedItems: CFArray?
      let importStatus = SecPKCS12Import(p12Data as CFData, options as CFDictionary, &importedItems)
      guard importStatus == errSecSuccess, let items = importedItems as? [[String: Any]], let first = items.first else {
        throw InstallError.importFailed(status: importStatus)
      }

      guard let identity = first[kSecImportItemIdentity as String] else {
        throw InstallError.noIdentity
      }
      let identityRef = identity as! SecIdentity

      let deleteQuery: [String: Any] = [
        kSecClass as String: kSecClassIdentity,
        kSecAttrLabel as String: alias,
      ]
      SecItemDelete(deleteQuery as CFDictionary)

      let addQuery: [String: Any] = [
        kSecValueRef as String: identityRef,
        kSecAttrLabel as String: alias,
      ]
      let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
      if addStatus != errSecSuccess && addStatus != errSecDuplicateItem {
        throw InstallError.keychainAddFailed(status: addStatus)
      }

      var cert: SecCertificate?
      SecIdentityCopyCertificate(identityRef, &cert)
      if let cert = cert {
        let certDeleteQuery: [String: Any] = [
          kSecClass as String: kSecClassCertificate,
          kSecAttrLabel as String: alias,
        ]
        SecItemDelete(certDeleteQuery as CFDictionary)
        let certAddQuery: [String: Any] = [
          kSecValueRef as String: cert,
          kSecAttrLabel as String: alias,
        ]
        SecItemAdd(certAddQuery as CFDictionary, nil)
      }

      let verifyQuery: [String: Any] = [
        kSecClass as String: kSecClassIdentity,
        kSecReturnRef as String: true,
        kSecAttrLabel as String: alias,
      ]
      var foundRef: CFTypeRef?
      let verifyStatus = SecItemCopyMatching(verifyQuery as CFDictionary, &foundRef)
      NSLog("[AtvCert] verify identity by alias status=%d found=%d", verifyStatus, foundRef != nil ? 1 : 0)
      if verifyStatus != errSecSuccess || foundRef == nil {
        throw InstallError.verificationFailed(status: verifyStatus)
      }
      return true
    }
  }
}

enum InstallError: Error, LocalizedError {
  case badBase64
  case importFailed(status: OSStatus)
  case noIdentity
  case keychainAddFailed(status: OSStatus)
  case verificationFailed(status: OSStatus)

  var errorDescription: String? {
    switch self {
    case .badBase64: return "PKCS#12 base64 decode failed"
    case .importFailed(let status): return "SecPKCS12Import failed: \(status)"
    case .noIdentity: return "PKCS#12 imported but contained no identity"
    case .keychainAddFailed(let status): return "SecItemAdd failed: \(status)"
    case .verificationFailed(let status): return "Identity lookup by alias after install failed: \(status)"
    }
  }
}
