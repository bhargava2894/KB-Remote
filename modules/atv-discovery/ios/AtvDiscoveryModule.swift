import ExpoModulesCore
import Network
import Foundation

public class AtvDiscoveryModule: Module {
  private var browser: NWBrowser?
  private let queue = DispatchQueue(label: "com.bsista.atvdiscovery")
  private var resolvedNames: Set<String> = []

  public func definition() -> ModuleDefinition {
    Name("AtvDiscovery")

    Events("serviceFound", "serviceLost")

    AsyncFunction("startDiscovery") { (promise: Promise) in
      self.queue.async {
        self.browser?.cancel()
        self.resolvedNames.removeAll()

        let parameters = NWParameters.tcp
        parameters.includePeerToPeer = false

        let descriptor = NWBrowser.Descriptor.bonjour(
          type: "_androidtvremote2._tcp",
          domain: nil
        )
        let browser = NWBrowser(for: descriptor, using: parameters)

        browser.browseResultsChangedHandler = { results, _ in
          for result in results {
            self.handleResult(result)
          }

          let currentNames = Set(results.compactMap { result -> String? in
            if case let .service(name, _, _, _) = result.endpoint {
              return name
            }
            return nil
          })
          let lost = self.resolvedNames.subtracting(currentNames)
          for lostName in lost {
            self.sendEvent("serviceLost", ["name": lostName])
            self.resolvedNames.remove(lostName)
          }
        }

        browser.stateUpdateHandler = { state in
          NSLog("[AtvDiscovery] state=\(state)")
        }

        self.browser = browser
        browser.start(queue: self.queue)
        promise.resolve(nil)
      }
    }

    AsyncFunction("stopDiscovery") { (promise: Promise) in
      self.queue.async {
        self.browser?.cancel()
        self.browser = nil
        self.resolvedNames.removeAll()
        promise.resolve(nil)
      }
    }
  }

  private func handleResult(_ result: NWBrowser.Result) {
    guard case let .service(name, _, _, _) = result.endpoint else { return }
    if resolvedNames.contains(name) { return }

    // Resolve the endpoint to a host + port via NWConnection (start + immediately cancel).
    let connection = NWConnection(to: result.endpoint, using: .tcp)
    connection.stateUpdateHandler = { state in
      if case .ready = state {
        if let endpoint = connection.currentPath?.remoteEndpoint,
           case let .hostPort(host, port) = endpoint {
          let hostString = self.formatHost(host)
          self.resolvedNames.insert(name)
          self.sendEvent("serviceFound", [
            "name": name,
            "host": hostString,
            "port": Int(port.rawValue),
          ])
        }
        connection.cancel()
      } else if case .failed = state {
        connection.cancel()
      }
    }
    connection.start(queue: queue)
  }

  private func formatHost(_ host: NWEndpoint.Host) -> String {
    switch host {
    case .ipv4(let addr):
      return addr.debugDescription.components(separatedBy: "%").first ?? addr.debugDescription
    case .ipv6(let addr):
      return addr.debugDescription.components(separatedBy: "%").first ?? addr.debugDescription
    case .name(let s, _):
      return s
    @unknown default:
      return ""
    }
  }
}
