# Chore Tracker Prototype

A simple Node.js command-line application for tracking household chores and managing children's allowances.

## Overview

This chore tracking system allows parents to create and manage chore assignments, while children can log their completed tasks and track their earned allowances. The system supports different chore types (daily, weekly, ad-hoc) and automatically calculates earnings based on completed work.

## Features

### For Parents
- **Create Chores**: Set up new chores with custom names, timing schedules, monetary values, and emojis
- **View Reports**: See detailed reports of all children's chore completions over the past 7 days
- **Manage Allowances**: Transfer earned money to children's balances based on completed chores
- **Chore Types**: Support for daily, weekly, and ad-hoc (one-time) chores

### For Children
- **Complete Chores**: Log when chores are finished and earn money
- **View Progress**: See completed chores and potential earnings from the past week
- **Check Balance**: Monitor current allowance balance

## Installation

1. Ensure you have Node.js installed (version 12 or higher)
2. Download or clone this repository
3. Navigate to the project directory

## Usage

### Running the Application

```bash
node app.js
```

### Getting Started

1. **Login**: Enter your name when prompted
   - **Parents**: "Aaron" or "Janet" (case-insensitive)
   - **Children**: Any other name

2. **Navigate Menus**: Use the numbered options to access different features

### Parent Workflow

#### 1. Setting Up Chores
- Choose option 1 from the parent menu
- Enter chore details:
  - Name (e.g., "Wash dishes")
  - Timing: Daily, Ad-hoc (one-time), or Weekly
  - Price (e.g., 1.50 for $1.50)
  - Emoji (e.g., 🧼)
  - Required status (affects allowance qualification)

#### 2. Monitoring Progress
- Choose option 2 to view the 7-day chore report
- See each child's completed chores and earnings

#### 3. Paying Allowances
- Choose option 3 to reconcile allowances
- Select a child and transfer earned money to their balance
- Can transfer custom amounts or use the default earned amount

### Child Workflow

#### 1. Completing Chores
- Choose option 2 from the child menu
- Select from the available chores list
- Get instant confirmation of completion

#### 2. Checking Progress
- Choose option 1 to view completed chores
- See all chores done in the past 7 days
- View potential earnings (pending parent approval)

#### 3. Monitoring Balance
- Current balance is displayed at the top of the child menu
- Balance increases when parents reconcile allowances

## User Roles

### Parents
- **Names**: "Aaron" or "Janet" (hardcoded in the system)
- **Capabilities**: Full access to chore management and allowance reconciliation

### Children
- **Names**: Any name except "Aaron" or "Janet"
- **Capabilities**: Chore completion and progress viewing only

## Technical Details

### Data Storage
- Uses in-memory storage (data is lost when the app restarts)
- Stores:
  - User information (name, role, balance)
  - Chore definitions (id, name, timing, price, emoji, required status)
  - Completion records (child, chore, timestamp)

### Dependencies
- Node.js built-in `readline` module for CLI interaction
- No external dependencies required

### Limitations
- Data is not persisted between sessions
- Single-user interface (no concurrent access)
- Hardcoded parent names
- No chore editing or deletion functionality
- Basic validation only

## Future Enhancements

Potential improvements for a full application:
- Database integration for data persistence
- User authentication and session management
- Web-based interface
- Chore scheduling and reminders
- Parent approval workflow for chore completions
- Reporting and analytics
- Multi-household support

## Example Usage

```
🧼 Welcome to the Chore Tracker prototype (Node CLI)

What is your name? (or type 'exit' to quit): Aaron

Hello, Aaron! You are logged in as a PARENT.

👩‍👧 Parent menu (Aaron)
  1) Set up a new chore
  2) View chore report
  3) Reconcile allowance
  4) Switch user
  5) Exit

Choose an option: 1

🧹 Create a new chore
Chore name: Wash dishes
Timing options:
  1) Daily
  2) Ad-hoc
  3) Weekly
Choose timing (1/2/3): 1
Price for performing this chore (e.g. 1.50): 1.50
Emoji for this chore (e.g. 🧼): 🧼
Is this chore required to qualify for allowance? (y/n): y

✅ New chore created:
{ id: 1, name: 'Wash dishes', timing: 'daily', price: 1.5, emoji: '🧼', required: true }
```

## Contributing

This is a prototype application. For improvements or modifications, edit the `app.js` file directly.

## License

This project is a personal prototype and is not licensed for distribution.
