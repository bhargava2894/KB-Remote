Pod::Spec.new do |s|
  s.name           = 'AtvCert'
  s.version        = '0.1.0'
  s.summary        = 'PKCS#12 keychain importer'
  s.description    = 'Imports a PKCS#12 identity into the iOS keychain for client-cert TLS.'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
