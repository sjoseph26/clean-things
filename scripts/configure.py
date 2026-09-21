#!/usr/bin/env python3
"""Generate public client config. Secrets never belong in an Android asset."""
import argparse, json, os, re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--demo', action='store_true')
args = parser.parse_args()
config = {'supabaseUrl': '', 'supabasePublishableKey': '', 'passwordResetUrl': ''}
if not args.demo:
    config = {'supabaseUrl': os.environ.get('CT_SUPABASE_URL', '').rstrip('/'),
              'supabasePublishableKey': os.environ.get('CT_SUPABASE_PUBLISHABLE_KEY', ''),
              'passwordResetUrl': os.environ.get('CT_PASSWORD_RESET_URL', '')}
    if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', config['supabaseUrl']):
        parser.error('CT_SUPABASE_URL must be the project HTTPS supabase.co URL.')
    if not config['supabasePublishableKey'].startswith('sb_publishable_'):
        parser.error('Use a public sb_publishable_ client key. Never use a secret/service-role key.')
    if config['passwordResetUrl'] and not config['passwordResetUrl'].startswith('https://'):
        parser.error('Password recovery requires an HTTPS redirect URL.')
target = Path(__file__).resolve().parents[1] / 'app/src/main/assets/config.js'
target.write_text('// Generated public client configuration; excluded from Git.\nwindow.CLEAN_THINGS_CONFIG = ' + json.dumps(config, indent=2) + ';\n')
print('Configured demo mode.' if args.demo else 'Configured connected mode. Values were not printed.')

