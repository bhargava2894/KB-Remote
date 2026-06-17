Pod::Spec.new do |s|
  s.name           = 'AtvDiscovery'
  s.version        = '0.1.0'
  s.summary        = 'mDNS discovery of Android TV / Sony Bravia devices'
  s.description    = 'Uses Network.framework NWBrowser to discover _androidtvremote2._tcp services on the local Wi-Fi.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
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
