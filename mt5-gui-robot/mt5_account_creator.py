#!/usr/bin/env python3
"""
MT5 Account Creator Robot
Automates MT5 demo account creation via GUI automation
"""

import time
import logging
import pyautogui
import cv2
import numpy as np
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, db as realtime_db
import json
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mt5_account_creator.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class MT5AccountCreator:
    def __init__(self, config_path='config.json'):
        """Initialize the MT5 Account Creator"""
        self.config = self.load_config(config_path)
        self.setup_firebase()
        self.setup_pyautogui()
        
    def load_config(self, config_path):
        """Load configuration from JSON file"""
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            logger.info(f"Configuration loaded from {config_path}")
            return config
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {config_path}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in configuration file: {e}")
            raise
    
    def setup_firebase(self):
        """Setup Firebase connection"""
        try:
            cred_path = self.config.get('firebase_credentials_path')
            if not cred_path:
                raise ValueError("firebase_credentials_path not in config")
            
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, {
                'databaseURL': self.config.get('firebase_database_url')
            })
            
            self.firestore = firestore.client()
            self.realtime_db = realtime_db.reference()
            logger.info("Firebase connection established")
        except Exception as e:
            logger.error(f"Failed to setup Firebase: {e}")
            raise
    
    def setup_pyautogui(self):
        """Setup PyAutoGUI with safety settings"""
        pyautogui.PAUSE = self.config.get('pyautogui_pause', 1)
        pyautogui.FAILSAFE = self.config.get('pyautogui_failsafe', True)
        logger.info("PyAutoGUI configured")
    
    def check_mt5_terminal_open(self):
        """Check if MT5 terminal is open"""
        try:
            # Try to find MT5 window by title
            mt5_window = pyautogui.locateOnScreen(
                self.config.get('mt5_window_screenshot', 'mt5_window.png'),
                confidence=self.config.get('image_confidence', 0.8)
            )
            if mt5_window:
                logger.info("MT5 terminal detected")
                return True
            else:
                logger.warning("MT5 terminal not detected")
                return False
        except Exception as e:
            logger.error(f"Error checking MT5 terminal: {e}")
            return False
    
    def open_mt5_terminal(self):
        """Open MT5 terminal"""
        try:
            mt5_path = self.config.get('mt5_terminal_path')
            if not mt5_path:
                raise ValueError("mt5_terminal_path not in config")
            
            logger.info(f"Opening MT5 terminal from {mt5_path}")
            os.startfile(mt5_path)
            
            # Wait for terminal to open
            time.sleep(self.config.get('mt5_open_wait_time', 10))
            
            if not self.check_mt5_terminal_open():
                raise Exception("Failed to open MT5 terminal")
            
            logger.info("MT5 terminal opened successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to open MT5 terminal: {e}")
            return False
    
    def navigate_to_open_account(self):
        """Navigate to File -> Open Account menu"""
        try:
            logger.info("Navigating to File -> Open Account")
            
            # Click on File menu
            file_menu_pos = self.config.get('file_menu_position', {'x': 50, 'y': 50})
            pyautogui.click(file_menu_pos['x'], file_menu_pos['y'])
            time.sleep(1)
            
            # Click on Open Account
            open_account_pos = self.config.get('open_account_position', {'x': 50, 'y': 100})
            pyautogui.click(open_account_pos['x'], open_account_pos['y'])
            time.sleep(2)
            
            logger.info("Navigated to Open Account dialog")
            return True
        except Exception as e:
            logger.error(f"Failed to navigate to Open Account: {e}")
            return False
    
    def select_broker_server(self, broker_name):
        """Select broker server from list"""
        try:
            logger.info(f"Selecting broker: {broker_name}")
            
            # Find and click on broker in list
            broker_position = self.config.get('broker_positions', {}).get(broker_name)
            if not broker_position:
                raise ValueError(f"Broker position not configured for {broker_name}")
            
            pyautogui.click(broker_position['x'], broker_position['y'])
            time.sleep(1)
            
            logger.info(f"Broker {broker_name} selected")
            return True
        except Exception as e:
            logger.error(f"Failed to select broker: {e}")
            return False
    
    def fill_account_form(self, capital, email=None):
        """Fill account creation form"""
        try:
            logger.info(f"Filling account form with capital: {capital}")
            
            # Click on Next button if needed
            next_pos = self.config.get('next_button_position', {'x': 500, 'y': 400})
            pyautogui.click(next_pos['x'], next_pos['y'])
            time.sleep(2)
            
            # Fill capital/leverage fields
            capital_field = self.config.get('capital_field_position', {'x': 300, 'y': 200})
            pyautogui.click(capital_field['x'], capital_field['y'])
            pyautogui.hotkey('ctrl', 'a')
            pyautogui.typewrite(str(capital))
            time.sleep(0.5)
            
            # Fill email if provided
            if email:
                email_field = self.config.get('email_field_position', {'x': 300, 'y': 250})
                pyautogui.click(email_field['x'], email_field['y'])
                pyautogui.hotkey('ctrl', 'a')
                pyautogui.typewrite(email)
                time.sleep(0.5)
            
            logger.info("Account form filled")
            return True
        except Exception as e:
            logger.error(f"Failed to fill account form: {e}")
            return False
    
    def submit_account_creation(self):
        """Submit account creation"""
        try:
            logger.info("Submitting account creation")
            
            # Click on Create/Open button
            create_button_pos = self.config.get('create_button_position', {'x': 400, 'y': 500})
            pyautogui.click(create_button_pos['x'], create_button_pos['y'])
            time.sleep(3)
            
            logger.info("Account creation submitted")
            return True
        except Exception as e:
            logger.error(f"Failed to submit account creation: {e}")
            return False
    
    def extract_credentials(self):
        """Extract login and password from success dialog"""
        try:
            logger.info("Extracting credentials from success dialog")
            
            # Take screenshot of success dialog
            screenshot = pyautogui.screenshot()
            
            # Use OCR to extract login and password
            # This is a placeholder - actual implementation would use Tesseract or similar
            login = "extracted_login"
            password = "extracted_password"
            
            logger.info(f"Credentials extracted: login={login}")
            return {
                'login': login,
                'password': password,
                'server': self.config.get('mt5_server', 'TMGM-Demo')
            }
        except Exception as e:
            logger.error(f"Failed to extract credentials: {e}")
            return None
    
    def save_to_firebase(self, credentials, capital, user_id):
        """Save credentials to Firebase"""
        try:
            logger.info(f"Saving credentials to Firebase for user {user_id}")
            
            # Add to mt5_demo_pool
            pool_ref = self.firestore.collection('mt5_demo_pool').document()
            pool_ref.set({
                'login': credentials['login'],
                'password': credentials['password'],
                'server': credentials['server'],
                'capital': capital,
                'status': 'available',
                'poolKind': 'challenge',
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'createdBy': 'gui_robot'
            })
            
            logger.info(f"Credentials saved to Firebase: {pool_ref.id}")
            return pool_ref.id
        except Exception as e:
            logger.error(f"Failed to save to Firebase: {e}")
            return None
    
    def process_queue(self):
        """Process account creation requests from Firebase queue"""
        try:
            logger.info("Checking Firebase queue for account creation requests")
            
            # Get pending requests from queue
            queue_ref = self.firestore.collection('account_creation_queue').where('status', '==', 'pending').limit(1)
            requests = queue_ref.get()
            
            if not requests:
                logger.info("No pending requests in queue")
                return
            
            for request in requests:
                request_data = request.to_dict()
                request_id = request.id
                
                logger.info(f"Processing request {request_id}: capital={request_data.get('capital')}")
                
                # Update status to processing
                request.reference.update({
                    'status': 'processing',
                    'startedAt': firestore.SERVER_TIMESTAMP
                })
                
                # Create account
                success = self.create_account(
                    capital=request_data.get('capital'),
                    email=request_data.get('email'),
                    user_id=request_data.get('user_id'),
                    broker=request_data.get('broker', 'TMGM')
                )
                
                # Update request status
                if success:
                    request.reference.update({
                        'status': 'completed',
                        'completedAt': firestore.SERVER_TIMESTAMP
                    })
                else:
                    request.reference.update({
                        'status': 'failed',
                        'error': 'Account creation failed',
                        'failedAt': firestore.SERVER_TIMESTAMP
                    })
                
        except Exception as e:
            logger.error(f"Error processing queue: {e}")
    
    def create_account(self, capital, email=None, user_id=None, broker='TMGM'):
        """Complete account creation process"""
        try:
            logger.info(f"Starting account creation: capital={capital}, broker={broker}")
            
            # Check if MT5 is open
            if not self.check_mt5_terminal_open():
                if not self.open_mt5_terminal():
                    return False
            
            # Navigate to Open Account
            if not self.navigate_to_open_account():
                return False
            
            # Select broker
            if not self.select_broker_server(broker):
                return False
            
            # Fill form
            if not self.fill_account_form(capital, email):
                return False
            
            # Submit
            if not self.submit_account_creation():
                return False
            
            # Extract credentials
            credentials = self.extract_credentials()
            if not credentials:
                return False
            
            # Save to Firebase
            if user_id:
                pool_id = self.save_to_firebase(credentials, capital, user_id)
                if not pool_id:
                    return False
            
            logger.info("Account creation completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Account creation failed: {e}")
            return False
    
    def run(self):
        """Main loop - process queue continuously"""
        logger.info("Starting MT5 Account Creator robot")
        
        while True:
            try:
                self.process_queue()
                time.sleep(self.config.get('queue_check_interval', 30))
            except KeyboardInterrupt:
                logger.info("Shutting down robot")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(60)  # Wait before retry

if __name__ == '__main__':
    try:
        robot = MT5AccountCreator('config.json')
        robot.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
