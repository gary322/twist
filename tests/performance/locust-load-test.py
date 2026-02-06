import time
import random
import json
from locust import HttpUser, task, between, events
from locust.env import Environment
from locust.stats import stats_printer, stats_history
from locust.log import setup_logging
import gevent

# Setup logging
setup_logging("INFO", None)

class InfluencerStakingUser(HttpUser):
    wait_time = between(1, 5)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user_id = f"user-{random.randint(1, 10000)}"
        self.auth_token = None
        self.influencers = [
            {"id": "inf-1", "username": "crypto_master"},
            {"id": "inf-2", "username": "defi_queen"},
            {"id": "inf-3", "username": "nft_artist"},
            {"id": "inf-4", "username": "web3_dev"},
            {"id": "inf-5", "username": "blockchain_educator"},
        ]
        self.search_queries = ["crypto", "defi", "nft", "web3", "blockchain", "staking", "yield"]
        self.stake_amounts = [1000, 5000, 10000, 25000, 50000]  # In TWIST tokens
    
    def on_start(self):
        """Called when a user starts"""
        self.login()
    
    def on_stop(self):
        """Called when a user stops"""
        pass
    
    def login(self):
        """Authenticate the user"""
        response = self.client.post("/api/auth/login", json={
            "email": f"{self.user_id}@test.com",
            "password": "Test123456!"
        })
        
        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("token")
            self.client.headers.update({"Authorization": f"Bearer {self.auth_token}"})
        else:
            print(f"Login failed for {self.user_id}")
    
    @task(30)
    def search_influencers(self):
        """Search for influencers"""
        query = random.choice(self.search_queries)
        sort_by = random.choice(["totalStaked", "stakerCount", "apy"])
        
        with self.client.get(
            f"/api/staking/search?query={query}&sortBy={sort_by}&limit=20",
            catch_response=True,
            name="/api/staking/search"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    response.success()
                    # Sometimes view details of a random influencer
                    if random.random() < 0.5:
                        influencer = random.choice(data)
                        self.view_influencer_details(influencer["id"])
                else:
                    response.failure("No results returned")
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(20)
    def view_influencer_details(self, influencer_id=None):
        """View detailed information about an influencer"""
        if not influencer_id:
            influencer = random.choice(self.influencers)
            influencer_id = influencer["id"]
        
        with self.client.get(
            f"/api/influencers/{influencer_id}",
            catch_response=True,
            name="/api/influencers/[id]"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if "pool" in data and "metrics" in data:
                    response.success()
                else:
                    response.failure("Missing required fields in response")
    
    @task(15)
    def stake_on_influencer(self):
        """Perform a staking operation"""
        influencer = random.choice(self.influencers)
        amount = random.choice(self.stake_amounts) * 10**9  # Convert to smallest unit
        
        payload = {
            "influencerId": influencer["id"],
            "amount": str(amount),
            "wallet": f"wallet_{self.user_id}_{int(time.time())}"
        }
        
        with self.client.post(
            "/api/staking/stake",
            json=payload,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("transactionId"):
                    response.success()
                    # Store transaction for potential future operations
                    self.last_transaction_id = data["transactionId"]
                else:
                    response.failure("Staking operation failed")
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(10)
    def check_portfolio(self):
        """Check user's staking portfolio"""
        with self.client.get(
            "/api/staking/user/stakes",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    response.success()
                    # Sometimes try to claim rewards
                    if len(data) > 0 and random.random() < 0.3:
                        stake = random.choice(data)
                        self.claim_rewards(stake["influencer"]["id"])
                else:
                    response.failure("Invalid portfolio format")
    
    @task(5)
    def claim_rewards(self, influencer_id=None):
        """Attempt to claim staking rewards"""
        if not influencer_id:
            influencer = random.choice(self.influencers)
            influencer_id = influencer["id"]
        
        payload = {
            "influencerId": influencer_id,
            "wallet": f"wallet_{self.user_id}"
        }
        
        with self.client.post(
            "/api/staking/claim",
            json=payload,
            catch_response=True
        ) as response:
            if response.status_code in [200, 400]:  # 400 might mean no rewards to claim
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(10)
    def view_analytics(self):
        """View analytics dashboard"""
        time_ranges = ["24h", "7d", "30d"]
        time_range = random.choice(time_ranges)
        
        endpoints = [
            f"/api/analytics/overview?timeRange={time_range}",
            f"/api/analytics/portfolio/performance?period={time_range}",
            "/api/analytics/top-earners?limit=10",
        ]
        
        endpoint = random.choice(endpoints)
        
        with self.client.get(
            endpoint,
            catch_response=True,
            name="/api/analytics/[endpoint]"
        ) as response:
            if response.status_code == 200:
                response.success()
    
    @task(8)
    def browse_content(self):
        """Browse influencer content"""
        with self.client.get(
            "/api/content?status=published&limit=20",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if "items" in data:
                    response.success()
                    # Sometimes view specific content
                    if len(data["items"]) > 0 and random.random() < 0.4:
                        content = random.choice(data["items"])
                        self.view_content_details(content["id"])
    
    @task(2)
    def view_content_details(self, content_id=None):
        """View specific content details"""
        if not content_id:
            content_id = f"content-{random.randint(1, 100)}"
        
        with self.client.get(
            f"/api/content/{content_id}",
            catch_response=True,
            name="/api/content/[id]"
        ) as response:
            if response.status_code == 200:
                response.success()
    
    @task(5)
    def check_notifications(self):
        """Check for new notifications"""
        with self.client.get(
            "/api/notifications/unread",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()

class WebSocketUser(HttpUser):
    """Separate user class for WebSocket testing"""
    wait_time = between(30, 60)
    
    def on_start(self):
        # Note: Locust doesn't have built-in WebSocket support
        # This is a placeholder for WebSocket-like behavior using HTTP
        self.login()
        self.subscribe_to_updates()
    
    def login(self):
        response = self.client.post("/api/auth/login", json={
            "email": f"wsuser-{random.randint(1, 1000)}@test.com",
            "password": "Test123456!"
        })
        
        if response.status_code == 200:
            data = response.json()
            self.auth_token = data.get("token")
            self.client.headers.update({"Authorization": f"Bearer {self.auth_token}"})
    
    def subscribe_to_updates(self):
        """Simulate WebSocket subscription using polling"""
        influencer = random.choice([
            {"id": "inf-1", "username": "crypto_master"},
            {"id": "inf-2", "username": "defi_queen"},
        ])
        
        # Store subscription info
        self.subscribed_influencer = influencer["id"]
    
    @task
    def poll_updates(self):
        """Poll for updates (simulating WebSocket)"""
        with self.client.get(
            f"/api/realtime/updates?influencerId={self.subscribed_influencer}",
            catch_response=True,
            name="/api/realtime/updates"
        ) as response:
            if response.status_code == 200:
                response.success()

# Custom event handlers for reporting
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("Load test starting...")

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("Load test stopping...")
    print(f"Total requests: {environment.stats.total.num_requests}")
    print(f"Failed requests: {environment.stats.total.num_failures}")
    print(f"Average response time: {environment.stats.total.avg_response_time}ms")
    print(f"RPS: {environment.stats.total.current_rps}")

# Custom load shapes for different test scenarios
class StagesShape(LoadTestShape):
    """
    A load test shape that goes through different stages:
    1. Warm-up
    2. Ramp-up
    3. Sustained load
    4. Spike test
    5. Cool down
    """
    
    stages = [
        {"duration": 120, "users": 100, "spawn_rate": 1, "name": "Warm-up"},
        {"duration": 300, "users": 500, "spawn_rate": 5, "name": "Ramp-up"},
        {"duration": 600, "users": 1000, "spawn_rate": 10, "name": "Sustained"},
        {"duration": 60, "users": 2000, "spawn_rate": 50, "name": "Spike"},
        {"duration": 300, "users": 500, "spawn_rate": 10, "name": "Recovery"},
        {"duration": 120, "users": 0, "spawn_rate": 5, "name": "Cool-down"},
    ]
    
    def tick(self):
        run_time = self.get_run_time()
        
        for stage in self.stages:
            if run_time < stage["duration"]:
                tick_data = (stage["users"], stage["spawn_rate"])
                return tick_data
            else:
                run_time -= stage["duration"]
        
        return None

# Run with:
# locust -f locust-load-test.py --host=http://localhost:3000
# locust -f locust-load-test.py --host=http://localhost:3000 --headless -u 1000 -r 10 -t 30m
# locust -f locust-load-test.py --host=http://localhost:3000 --web-host=0.0.0.0 --web-port=8089