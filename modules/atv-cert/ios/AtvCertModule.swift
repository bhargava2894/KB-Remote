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

    AsyncFunction("generateRsaKeyPair") { () -> [String: String] in
      let started = Date()
      let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
        kSecAttrKeySizeInBits as String: 2048,
        kSecAttrIsPermanent as String: false,
      ]

      var error: Unmanaged<CFError>?
      guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw GenerateKeyError.creationFailed(
          (error?.takeRetainedValue() as Error?)?.localizedDescription ?? "unknown"
        )
      }
      guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
        throw GenerateKeyError.publicKeyExtractionFailed
      }
      guard let privateData = SecKeyCopyExternalRepresentation(privateKey, &error) as Data? else {
        throw GenerateKeyError.exportFailed(
          (error?.takeRetainedValue() as Error?)?.localizedDescription ?? "unknown"
        )
      }
      guard let publicData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        throw GenerateKeyError.exportFailed(
          (error?.takeRetainedValue() as Error?)?.localizedDescription ?? "unknown"
        )
      }

      let privatePem = AtvCertModule.encodePem(label: "RSA PRIVATE KEY", der: privateData)
      let publicPem = AtvCertModule.encodePem(label: "RSA PUBLIC KEY", der: publicData)

      let elapsedMs = Int(Date().timeIntervalSince(started) * 1000)
      NSLog("[AtvCert] Generated 2048-bit RSA keypair in %dms", elapsedMs)

      return ["privateKeyPem": privatePem, "publicKeyPem": publicPem]
    }
  }

  private static func encodePem(label: String, der: Data) -> String {
    let base64 = der.base64EncodedString()
    var wrapped = ""
    var index = base64.startIndex
    while index < base64.endIndex {
      let end = base64.index(index, offsetBy: 64, limitedBy: base64.endIndex) ?? base64.endIndex
      wrapped += base64[index..<end]
      wrapped += "\n"
      index = end
    }
    return "-----BEGIN \(label)-----\n\(wrapped)-----END \(label)-----\n"
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

enum GenerateKeyError: Error, LocalizedError {
  case creationFailed(String)
  case publicKeyExtractionFailed
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .creationFailed(let msg): return "SecKeyCreateRandomKey failed: \(msg)"
    case .publicKeyExtractionFailed: return "SecKeyCopyPublicKey returned nil"
    case .exportFailed(let msg): return "SecKeyCopyExternalRepresentation failed: \(msg)"
    }
  }
}
