<?php
// Teste temporário (24/11/2026): o servidor da HostGator consegue falar com o conector do WhatsApp Web no PC do velório?
// Só lê a página de boas-vindas (pública, sem chave). APAGUE este arquivo depois do teste.
header('Content-Type: text/plain; charset=utf-8');
$cert = <<<PEM
-----BEGIN CERTIFICATE-----
MIIDdTCCAl2gAwIBAgIUa7dz6cVEigeVTkfr4BujtCB8SecwDQYJKoZIhvcNAQEL
BQAwMDEuMCwGA1UEAwwld2EyLnBsYW5vYXNzaXN0ZW5jaWFsaW50ZWdyYWRvLmNv
bS5icjAeFw0yNjExMjQxODI4MTJaFw0zNjExMjExODI4MTJaMDAxLjAsBgNVBAMM
JXdhMi5wbGFub2Fzc2lzdGVuY2lhbGludGVncmFkby5jb20uYnIwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7v/fJE9X+OWh91gFkS9SXmiwCf3zLj9vr
LzHnpcixHZI8DOdz+/mF/xSrihb4NIaSs7DisJT7ZMoZOntBK5e2S8DaDiC+kJ/x
6pVZ9rTUuDC1OxpI5d/IQ4lbDWkjRm4/+JrqOF46ffEIY9NsfGCmotSIEqE/1GvU
0oQwL4vKcI5IO8d+XHOaOFa6P6uiAq1vFZeo58fQqj+l6avnhabT18UM4JkPAF0p
a5IauaTTC5WelMzce+zlGraY9dkGMImzubGwPXNP6r8O7o4Fxxbn4hU+tk9yCoB/
oJ73dJOUs0MV35dIBLNfV3jQBg/lqk9JVFtcvqLhhWeWtCwZShNDAgMBAAGjgYYw
gYMwHQYDVR0OBBYEFKpZUKLTcYeCoeLv4sIB0+Pkw6Z5MB8GA1UdIwQYMBaAFKpZ
UKLTcYeCoeLv4sIB0+Pkw6Z5MA8GA1UdEwEB/wQFMAMBAf8wMAYDVR0RBCkwJ4Il
d2EyLnBsYW5vYXNzaXN0ZW5jaWFsaW50ZWdyYWRvLmNvbS5icjANBgkqhkiG9w0B
AQsFAAOCAQEAcGlxrqapmoKL+GKMHEvCLLtHCbJ9EQWkzSgHYX8clw9gbJKGhxB6
wJWMMzJlFnfGmp+pjMyhYsx6HTW1XAse4KhmALX9Hbzicvvi+1pwqX7M1Tlyr2wI
ixUxZQ2h1dr6t6zPj441TYcgajp5NcwQGxN42icIftgrXkTE81jnemx6tF8MOjhe
R8U/HnYuMfS7ui0vzhp2N5be+agaUTvSyGGDlVl1RGzI/HL4+3OqqfEiYSBkDhb8
TleHRDIr0zyAk3mXBgH1j5GsMpeNBKDSERgK8AjXDnwZSAnDOO9bB9dO0N1enuLM
E2QQOogHNnPEjWvE3LtVKG3KKjiF6F9DJA==
-----END CERTIFICATE-----
PEM;
$tmp = tempnam(sys_get_temp_dir(), 'wa2');
file_put_contents($tmp, $cert);
foreach ([4040, 443] as $porta) {
    $url = "https://wa2.planoassistencialintegrado.com.br:$porta/";
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CAINFO => $tmp,          // confia só no certificado do conector
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $t = microtime(true);
    $r = curl_exec($ch);
    $ms = round((microtime(true) - $t) * 1000);
    echo "Porta $porta: ";
    if ($r === false) echo "FALHOU - " . curl_error($ch) . " ({$ms} ms)\n";
    else echo "HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " em {$ms} ms\n" . substr($r, 0, 160) . "\n";
    curl_close($ch);
}
@unlink($tmp);
