import ExpoModulesCore
import Network
import Security
import Foundation

public class AtvTlsModule: Module {
  private var connections: [String: NWConnection] = [:]
  private var peerCerts: [String: Data] = [:]
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "com.bsista.atvtls")

  public func definition() -> ModuleDefinition {
    Name("AtvTls")

    Events("data", "connect", "close", "error")

    AsyncFunction("connect") { (connectionId: String, host: String, port: Int, p12Base64: String, password: String) -> Void in
      guard let p12Data = Data(base64Encoded: p12Base64) else {
        throw TlsError.badBase64
      }

      let importOptions: [String: Any] = [kSecImportExportPassphrase as String: password]
      var importedItems: CFArray?
      print("[AtvTlsModule] Starting PKCS12 import")

      let importStatus = SecPKCS12Import(p12Data as CFData, importOptions as CFDictionary, &importedItems)
      guard importStatus == errSecSuccess,
            let items = importedItems as? [[String: Any]],
            let first = items.first,
            let identityRaw = first[kSecImportItemIdentity as String] else {
        throw TlsError.importFailed(status: importStatus)
      }
      let secIdentity = identityRaw as! SecIdentity

      let identityWrapped = sec_identity_create(secIdentity)
      guard let identityWrapped = identityWrapped else {
        throw TlsError.identityWrapFailed
      }

      let tlsOptions = NWProtocolTLS.Options()
      sec_protocol_options_set_local_identity(tlsOptions.securityProtocolOptions, identityWrapped)

      let id = connectionId
      let weakSelf = self
      sec_protocol_options_set_verify_block(
        tlsOptions.securityProtocolOptions,
        { (_, secTrust, completionHandler) in
          let trust = sec_trust_copy_ref(secTrust).takeRetainedValue()
          if let leaf = Self.copyLeafCertificate(from: trust) {
            let certData = SecCertificateCopyData(leaf) as Data
            weakSelf.lock.lock()
            weakSelf.peerCerts[id] = certData
            weakSelf.lock.unlock()
            print("[AtvTlsModule] Captured peer leaf cert bytes=\(certData.count)")
          } else {
            print("[AtvTlsModule] Peer leaf cert was unavailable")
          }
          completionHandler(true)
        },
        self.queue
      )

      let tcpOptions = NWProtocolTCP.Options()
      let params = NWParameters(tls: tlsOptions, tcp: tcpOptions)
      params.allowLocalEndpointReuse = true

      let conn = NWConnection(
        host: NWEndpoint.Host(host),
        port: NWEndpoint.Port(integerLiteral: UInt16(port)),
        using: params
      )

      self.lock.lock()
      self.connections[id] = conn
      self.lock.unlock()

      conn.stateUpdateHandler = { [weak self] state in
        print("[AtvTlsModule] State updated to \(state)")
        guard let self = self else { return }
        switch state {
        case .ready:
          self.emitConnectWhenReady(connectionId: id, port: port, attempt: 0)
          self.startReceive(id: id, conn: conn)
        case .waiting(let err):
          self.sendEvent("error", [
            "connectionId": id,
            "message": err.localizedDescription,
          ])
          conn.cancel()
          self.removeConnection(id: id)
        case .failed(let err):
          self.sendEvent("error", [
            "connectionId": id,
            "message": err.localizedDescription,
          ])
          self.removeConnection(id: id)
        case .cancelled:
          self.sendEvent("close", ["connectionId": id])
          self.removeConnection(id: id)
        default:
          break
        }
      }

      print("[AtvTlsModule] Calling conn.start()")

      conn.start(queue: self.queue)
    }

    AsyncFunction("send") { (connectionId: String, dataBase64: String) -> Void in
      self.lock.lock()
      let conn = self.connections[connectionId]
      self.lock.unlock()
      guard let conn = conn else {
        throw TlsError.noConnection
      }
      guard let data = Data(base64Encoded: dataBase64) else {
        throw TlsError.badBase64
      }
      conn.send(content: data, completion: .contentProcessed { _ in })
    }

    AsyncFunction("close") { (connectionId: String) -> Void in
      self.lock.lock()
      let conn = self.connections[connectionId]
      self.lock.unlock()
      conn?.cancel()
      self.removeConnection(id: connectionId)
    }
  }

  private func startReceive(id: String, conn: NWConnection) {
    conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      guard let self = self else { return }
      if let data = data, !data.isEmpty {
        self.sendEvent("data", [
          "connectionId": id,
          "dataBase64": data.base64EncodedString(),
        ])
      }
      if let error = error {
        self.sendEvent("error", [
          "connectionId": id,
          "message": error.localizedDescription,
        ])
        return
      }
      if isComplete {
        self.sendEvent("close", ["connectionId": id])
        self.removeConnection(id: id)
        return
      }
      self.lock.lock()
      let stillOpen = self.connections[id] != nil
      self.lock.unlock()
      if stillOpen {
        self.startReceive(id: id, conn: conn)
      }
    }
  }

  private func removeConnection(id: String) {
    lock.lock()
    connections.removeValue(forKey: id)
    peerCerts.removeValue(forKey: id)
    lock.unlock()
  }

  private func emitConnectWhenReady(connectionId: String, port: Int, attempt: Int) {
    lock.lock()
    let peerCert = peerCerts[connectionId]
    let hasConnection = connections[connectionId] != nil
    lock.unlock()

    guard hasConnection else {
      return
    }

    if let peerCert {
      sendEvent("connect", [
        "connectionId": connectionId,
        "peerCertBase64": peerCert.base64EncodedString(),
      ])
      return
    }

    if attempt >= 10 {
      if port == 6467 {
        sendEvent("error", [
          "connectionId": connectionId,
          "message": "TV public key unavailable for pairing",
        ])
        lock.lock()
        let conn = connections[connectionId]
        lock.unlock()
        conn?.cancel()
        return
      }

      sendEvent("connect", [
        "connectionId": connectionId,
        "peerCertBase64": "",
      ])
      return
    }

    queue.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      self?.emitConnectWhenReady(connectionId: connectionId, port: port, attempt: attempt + 1)
    }
  }

  private static func copyLeafCertificate(from trust: SecTrust) -> SecCertificate? {
    if #available(iOS 15.0, *) {
      if let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
         let leaf = chain.first {
        return leaf
      }
    }

    if SecTrustGetCertificateCount(trust) > 0 {
      return SecTrustGetCertificateAtIndex(trust, 0)
    }

    return nil
  }
}

enum TlsError: Error, LocalizedError {
  case badBase64
  case importFailed(status: OSStatus)
  case identityWrapFailed
  case noConnection

  var errorDescription: String? {
    switch self {
    case .badBase64: return "Bad base64 input"
    case .importFailed(let s): return "SecPKCS12Import failed: \(s)"
    case .identityWrapFailed: return "sec_identity_create returned nil"
    case .noConnection: return "Unknown connection ID"
    }
  }
}
