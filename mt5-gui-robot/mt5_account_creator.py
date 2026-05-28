#!/usr/bin/env python3
"""
MT5 Account Creator Robot
Automates MT5 demo account creation via GUI automation (Admirals SC)
Uses win32gui for window-relative positioning - robust to window movement
"""

import time
import logging
import random
import string
import re
import pyautogui
import win32gui
import win32con
import win32api
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('mt5_account_creator.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --- Window helper ---

def find_window(title_contains):
    result = []
    def enum_cb(hwnd, _):
        if win32gui.IsWindowVisible(hwnd):
            t = win32gui.GetWindowText(hwnd)
            if title_contains.lower() in t.lower():
                result.append(hwnd)
    win32gui.EnumWindows(enum_cb, None)
    return result[0] if result else None

def win_rect(hwnd):
    return win32gui.GetWindowRect(hwnd)  # (left, top, right, bottom)

def click_rel(hwnd, rx, ry):
    """Click at relative position (rx, ry) as fraction of window size."""
    l, t, r, b = win_rect(hwnd)
    x = int(l + (r - l) * rx)
    y = int(t + (b - t) * ry)
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.2)
    pyautogui.click(x, y)
    return x, y

def type_in_field(hwnd, rx, ry, text):
    """Click field and type text."""
    click_rel(hwnd, rx, ry)
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.typewrite(text, interval=0.05)

def screenshot_window(hwnd):
    """Take screenshot of window region."""
    l, t, r, b = win_rect(hwnd)
    return pyautogui.screenshot(region=(l, t, r - l, b - t))

# --- Account data generator ---

FIRST_NAMES = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Drew', 'Blake', 'Jamie']
LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Moore', 'Martin', 'Lee', 'White', 'Clark']

def generate_account_data(capital):
    ts = int(time.time())
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    email = f"demo.{ts}.{random.randint(1000,9999)}@tradedemo.net"
    return {
        'first_name': first,
        'last_name': last,
        'email': email,
        'deposit': str(capital),
        'dob': '01/01/1990',
        'phone': '0600000000',
    }


class MT5AccountCreator:
    def __init__(self, config_path='config.json'):
        self.config = self._load_config(config_path)
        self._setup_firebase()
        pyautogui.PAUSE = self.config.get('pyautogui_pause', 0.8)
        pyautogui.FAILSAFE = True

    def _load_config(self, path):
        with open(path, 'r') as f:
            return json.load(f)

    def _setup_firebase(self):
        cred_path = self.config['firebase_credentials_path']
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'databaseURL': self.config.get('firebase_database_url')
        })
        self.db = firestore.client()
        logger.info("Firebase connected")

    # --- MT5 window ---

    def ensure_mt5_open(self):
        hwnd = find_window('MetaTrader 5')
        if not hwnd:
            logger.info("Opening MT5...")
            os.startfile(self.config['mt5_terminal_path'])
            time.sleep(self.config.get('mt5_open_wait_time', 12))
            hwnd = find_window('MetaTrader 5')
        if not hwnd:
            raise Exception("MT5 window not found")
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)
        return hwnd

    def open_account_dialog(self, mt5_hwnd):
        """Open File -> Open Account via keyboard shortcut."""
        win32gui.SetForegroundWindow(mt5_hwnd)
        time.sleep(0.5)
        pyautogui.hotkey('alt', 'F4')  # close any open dialog
        time.sleep(0.3)
        win32gui.SetForegroundWindow(mt5_hwnd)
        time.sleep(0.3)
        # Use menu: File -> Open Account
        pyautogui.hotkey('alt', 'f')
        time.sleep(0.8)
        pyautogui.press('o')
        time.sleep(2)
        dlg = find_window('Open an Account')
        if not dlg:
            raise Exception("'Open an Account' dialog not found")
        return dlg

    def select_admirals_sc(self, dlg):
        """In company list, search and select Admirals SC."""
        l, t, r, b = win_rect(dlg)
        win32gui.SetForegroundWindow(dlg)
        time.sleep(0.5)
        # Click search field (top area of dialog)
        search_x = int(l + (r - l) * 0.45)
        search_y = int(t + (b - t) * 0.18)
        pyautogui.click(search_x, search_y)
        time.sleep(0.3)
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.typewrite('Admirals', interval=0.05)
        time.sleep(0.5)
        # Click Find your company button
        find_x = int(l + (r - l) * 0.82)
        find_y = int(t + (b - t) * 0.18)
        pyautogui.click(find_x, find_y)
        time.sleep(3)
        # Click first result (Admirals SC Ltd row)
        row_x = int(l + (r - l) * 0.45)
        row_y = int(t + (b - t) * 0.38)
        pyautogui.click(row_x, row_y)
        time.sleep(0.5)
        # Click Next
        next_x = int(l + (r - l) * 0.82)
        next_y = int(t + (b - t) * 0.92)
        pyautogui.click(next_x, next_y)
        time.sleep(2)

    def select_demo_and_next(self):
        """Select 'Open a demo account' radio and click Next."""
        dlg = find_window('Open an Account')
        if not dlg:
            raise Exception("Account type dialog not found")
        l, t, r, b = win_rect(dlg)
        win32gui.SetForegroundWindow(dlg)
        time.sleep(0.3)
        # Click demo radio button (top option)
        radio_x = int(l + (r - l) * 0.1)
        radio_y = int(t + (b - t) * 0.28)
        pyautogui.click(radio_x, radio_y)
        time.sleep(0.5)
        # Click Next
        next_x = int(l + (r - l) * 0.82)
        next_y = int(t + (b - t) * 0.92)
        pyautogui.click(next_x, next_y)
        time.sleep(2)

    def fill_form(self, data):
        """Fill the account creation form. Returns True if submitted."""
        dlg = find_window('Open an Account')
        if not dlg:
            raise Exception("Form dialog not found")
        l, t, r, b = win_rect(dlg)
        win32gui.SetForegroundWindow(dlg)
        time.sleep(0.5)
        w = r - l
        h = b - t

        def field(rx, ry, text):
            x = int(l + w * rx)
            y = int(t + h * ry)
            pyautogui.click(x, y)
            time.sleep(0.3)
            pyautogui.hotkey('ctrl', 'a')
            pyautogui.typewrite(text, interval=0.05)
            time.sleep(0.2)

        # Form field relative positions (calibrated for Admirals SC form)
        field(0.55, 0.175, data['first_name'])   # First name
        field(0.55, 0.255, data['last_name'])     # Last name
        field(0.55, 0.335, data['dob'])           # Date of birth
        field(0.55, 0.415, data['email'])         # Email
        field(0.65, 0.495, data['phone'])         # Phone number

        # Set deposit via dropdown - click and select custom value
        deposit_x = int(l + w * 0.38)
        deposit_y = int(t + h * 0.635)
        pyautogui.click(deposit_x, deposit_y)
        time.sleep(0.5)
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.typewrite(data['deposit'], interval=0.05)
        time.sleep(0.3)

        # Check terms checkbox if not checked
        chk_x = int(l + w * 0.1)
        chk_y = int(t + h * 0.84)
        pyautogui.click(chk_x, chk_y)
        time.sleep(0.3)

        # Click Next to submit
        next_x = int(l + w * 0.82)
        next_y = int(t + h * 0.92)
        pyautogui.click(next_x, next_y)
        time.sleep(4)
        return True

    def extract_credentials(self):
        """Extract login/password from success screen using pywinauto (no OCR needed)."""
        try:
            from pywinauto import Application, findwindows
            time.sleep(1)
            wins = findwindows.find_windows(title_re='.*Open an Account.*')
            if not wins:
                raise Exception("Success dialog not found")
            app = Application().connect(handle=wins[0])
            dlg = app.window(handle=wins[0])
            full_text = dlg.window_text() + '\n'
            for ctrl in dlg.children():
                try:
                    full_text += ctrl.window_text() + '\n'
                except Exception:
                    pass
            logger.info(f"Dialog text: {full_text[:500]}")
            login_match = re.search(r'(?:Login|login|Account)[:\s]+(\d{5,12})', full_text)
            pass_match = re.search(r'(?:Password|password|Pass)[:\s]+(\S{4,20})', full_text)
            if login_match and pass_match:
                return {
                    'login': login_match.group(1),
                    'password': pass_match.group(1),
                    'server': 'AdmiralsSC-Demo'
                }
            # Fallback: screenshot for manual review
            dlg_hwnd = find_window('Open an Account')
            if dlg_hwnd:
                l, t, r, b = win_rect(dlg_hwnd)
                img = pyautogui.screenshot(region=(l, t, r - l, b - t))
                img.save(f'credential_screenshot_{int(time.time())}.png')
            logger.warning("Could not extract credentials - screenshot saved")
            return None
        except Exception as e:
            logger.error(f"Credential extraction failed: {e}")
            return None

    def close_dialog(self):
        dlg = find_window('Open an Account')
        if dlg:
            win32gui.PostMessage(dlg, win32con.WM_CLOSE, 0, 0)
            time.sleep(1)

    def save_to_pool(self, creds, capital, pool_kind='challenge'):
        doc = self.db.collection('mt5_demo_pool').document()
        doc.set({
            'login': creds['login'],
            'password': creds['password'],
            'server': creds['server'],
            'capital': capital,
            'status': 'available',
            'poolKind': pool_kind,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'createdBy': 'gui_robot'
        })
        logger.info(f"Saved to pool: {doc.id} login={creds['login']}")
        return doc.id

    def create_account(self, capital, pool_kind='challenge'):
        """Full account creation flow."""
        logger.info(f"Creating account: capital={capital}")
        data = generate_account_data(capital)
        try:
            mt5_hwnd = self.ensure_mt5_open()
            time.sleep(1)

            dlg = self.open_account_dialog(mt5_hwnd)
            self.select_admirals_sc(dlg)
            self.select_demo_and_next()
            self.fill_form(data)

            creds = self.extract_credentials()
            self.close_dialog()

            if creds:
                self.save_to_pool(creds, capital, pool_kind)
                logger.info(f"Account created: {creds['login']}")
                return creds
            else:
                logger.error("Could not extract credentials")
                return None
        except Exception as e:
            logger.error(f"Account creation failed: {e}")
            self.close_dialog()
            return None

    def process_queue(self):
        """Process pending requests from Firestore queue."""
        queue = self.db.collection('account_creation_queue') \
            .where('status', '==', 'pending').limit(1).get()
        if not queue:
            return
        for req in queue:
            data = req.to_dict()
            req.reference.update({'status': 'processing', 'startedAt': firestore.SERVER_TIMESTAMP})
            creds = self.create_account(
                capital=data.get('capital', 10000),
                pool_kind=data.get('poolKind', 'challenge')
            )
            if creds:
                req.reference.update({'status': 'completed', 'completedAt': firestore.SERVER_TIMESTAMP})
            else:
                req.reference.update({'status': 'failed', 'failedAt': firestore.SERVER_TIMESTAMP})

    def run(self):
        logger.info("MT5 Account Creator started")
        while True:
            try:
                self.process_queue()
                time.sleep(self.config.get('queue_check_interval', 30))
            except KeyboardInterrupt:
                logger.info("Stopped")
                break
            except Exception as e:
                logger.error(f"Loop error: {e}")
                time.sleep(60)


if __name__ == '__main__':
    robot = MT5AccountCreator('config.json')
    robot.run()
