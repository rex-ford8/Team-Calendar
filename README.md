# TeamCal

A shared team calendar with Gmail notifications. Update events daily and get automatic Gmail drafts sent to your team.

## Features

- 📅 **Monthly calendar view** with color-coded team members
- 📧 **Gmail integration** — Creates notification drafts when you add/update events
- ⚙️ **Team management** — Configure names and Gmail addresses
- 🎨 **Beautiful UI** — Warm, professional design with smooth interactions
- 🔔 **Smart notifications** — Notify just attendees or the whole team

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Start the development server
```bash
npm start
```

The app will open at `http://localhost:3000`

### 3. Configure Gmail (First Time)

You need to authenticate with Gmail to send notifications:

1. When you try to send your first notification, the app will prompt you to authorize Gmail access
2. This uses the Anthropic API with Gmail MCP integration
3. Make sure you have API access to Claude (via claude.ai or your own API key)

### 4. Add your team members

Click the **⚙ Settings** button and add:
- Team member names
- Their Gmail addresses (required for notifications)

## How to Use

1. **Click any day** on the calendar to add an event
2. **Fill in details:**
   - Event title
   - Type (Meeting, Reminder, Deadline, Review)
   - Time
   - Notes (optional)
   - Select attendees
3. **Enable Gmail notifications** — toggle "Send Gmail notification"
4. **Click "Save & Notify"** — a Gmail draft is created
5. **Go to Gmail** — review and send the draft to your team

## Making Changes

This is a React component, so you can customize:

- **Colors** — Edit the color codes in `DEFAULT_MEMBERS` array
- **Event types** — Modify the `EVENT_TYPES` array to add new event categories
- **Styling** — All CSS is inline in the component
- **Behavior** — Adjust the `sendGmailNotification` function for different notification formats

### Key Files

- `src/App.jsx` — Main TeamCal component (the entire app)
- Everything is self-contained for easy customization

## API Configuration

The app uses the Anthropic API to send Gmail notifications. If you want to deploy this or use your own API key, update this section in the code:

```javascript
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    mcp_servers: [{ type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail-mcp" }],
    messages: [{ role: "user", content: prompt }],
  }),
});
```

## Troubleshooting

**Gmail drafts not being created?**
- Make sure all attendees have valid Gmail addresses in Settings
- Check that you're authenticated with Gmail in Claude
- Look at the notification bar for error details

**Want to notify everyone but some don't have emails?**
- Go to Settings and add email addresses for all team members
- Use the "Notify entire team" checkbox if you want to send to everyone

## Future Improvements

- Recurring events
- Event reminders (not just Gmail)
- Integration with Google Calendar
- Dark mode
- Export to iCal format

## License

MIT

---

Built with React and Anthropic's Claude API
