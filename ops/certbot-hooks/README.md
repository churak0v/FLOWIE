# Flowie Certbot hooks

The production certificate is issued as RSA for compatibility with VPN and
proxy stacks that cannot complete an ECDSA-only TLS handshake.

Install these scripts into the matching directories under
`/etc/letsencrypt/renewal-hooks/`. The hooks stop the edge container for the
standalone ACME challenge, copy the renewed certificate into the bind-mounted
TLS directory, and start the edge container again.
