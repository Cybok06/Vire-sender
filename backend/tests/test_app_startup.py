"""Exercise deployment entry points without connecting to a real database."""
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class AppStartupTests(unittest.TestCase):
    def test_deployment_entry_points_register_distinct_sms_blueprints(self):
        script = """
import runpy
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

root = Path.cwd()
sys.path.insert(0, str(root / 'backend'))
from config import Config

with patch.object(Config, 'MONGO_URI', 'mongodb://localhost/startup_test'), \
     patch('pymongo.MongoClient', return_value=MagicMock()):
    app = runpy.run_path(sys.argv[1], run_name='startup_test')['app']

assert app.blueprints['admin_sms'] is not app.blueprints['admin_users_sms']
routes = {rule.rule: rule.endpoint for rule in app.url_map.iter_rules()}
assert routes['/api/admin/users-sms'] == 'admin_users_sms.report'
assert routes['/api/admin/users-sms/<user_id>/adjust'] == 'admin_users_sms.adjust'
assert any(endpoint.startswith('admin_sms.') for endpoint in routes.values())
client = app.test_client()
assert client.get('/api/health').status_code == 200
assert client.get('/api/admin/users-sms').status_code == 401
assert client.post('/api/admin/users-sms/test/adjust', json={}).status_code == 401
print('Startup, SMS routes and health check passed')
"""
        for entry_point in ('app.py', 'backend/app.py'):
            with self.subTest(entry_point=entry_point):
                result = subprocess.run([sys.executable, '-c', script, entry_point],
                                        cwd=ROOT, capture_output=True, text=True, timeout=60)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
