import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import api, { errorMessage } from "../api";
import PageHeader from "../components/PageHeader";

const DEFAULT_FIXED_TEXT =
  "Hi 👋\n\nThank you for contacting me.\n\nI have received your message and will respond as soon as possible.";

const DEFAULT_FORM = {
  IsEnabled: 1,
  FixedReplyEnabled: 1,
  AlwaysSendFixedMessage: 1,
  AIReplyEnabled: 1,
  FixedReplyText: DEFAULT_FIXED_TEXT,
};

export default function AiAutoReplySettings() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState({ open: false, severity: "success", message: "" });

  const notify = (severity, message) => setNotice({ open: true, severity, message });

  const fetchSettings = useCallback(async () => {
    try {
      const response = await api.get("/ai/settings");
      if (response.data.success && response.data.data && response.data.data.Id) {
        setForm(response.data.data);
      }
    } catch (err) {
      notify("error", "Failed to load settings: " + errorMessage(err));
    }
  }, []);

  const fetchHistory = useCallback(async (quiet = false) => {
    if (!quiet) setHistoryLoading(true);
    try {
      const response = await api.get("/ai/history");
      if (response.data.success) setHistory(response.data.data || []);
    } catch (err) {
      if (!quiet) notify("error", "Failed to load history: " + errorMessage(err));
    } finally {
      if (!quiet) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchSettings(), fetchHistory(true)]);
      setLoading(false);
    };
    init();
  }, [fetchSettings, fetchHistory]);

  const handleSwitch = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.checked ? 1 : 0 }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await api.put("/ai/settings", form);
      if (response.data.success) {
        setForm(response.data.data);
        notify("success", "Settings saved successfully!");
      }
    } catch (err) {
      notify("error", "Failed to save: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (iso) => (iso ? new Date(iso).toLocaleString() : "-");

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Determine the active behavior label for the info chip
  const getBehaviorLabel = () => {
    if (!form.IsEnabled) return { label: "Auto Reply OFF", color: "default" };
    if (form.FixedReplyEnabled && form.AlwaysSendFixedMessage && form.AIReplyEnabled)
      return { label: "Fixed + AI Reply", color: "success" };
    if (form.FixedReplyEnabled && form.AlwaysSendFixedMessage && !form.AIReplyEnabled)
      return { label: "Fixed Reply Only", color: "primary" };
    if (!form.FixedReplyEnabled && form.AIReplyEnabled)
      return { label: "AI Reply Only", color: "secondary" };
    return { label: "Active", color: "success" };
  };

  const behavior = getBehaviorLabel();

  return (
    <>
      <PageHeader
        title="AI Auto Reply"
        subtitle="Automatically reply to incoming WhatsApp messages using a fixed message and/or AI."
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshOutlinedIcon />}
            onClick={() => { fetchSettings(); fetchHistory(false); }}
          >
            Refresh Data
          </Button>
        }
      />

      <Grid container spacing={3}>
        {/* ── Settings Column ── */}
        <Grid item xs={12} lg={5}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
                <SmartToyOutlinedIcon color="primary" />
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  Configuration
                </Typography>
                <Chip label={behavior.label} color={behavior.color} size="small" />
              </Box>

              <Box component="form" onSubmit={handleSave}>
                <Stack spacing={3}>

                  {/* 1. Enable Auto Reply */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.IsEnabled === 1}
                        onChange={handleSwitch("IsEnabled")}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">Enable Auto Reply</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Master toggle — globally enable or disable all auto replies.
                        </Typography>
                      </Box>
                    }
                  />

                  <Divider />

                  {/* 2. Enable Fixed Message */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.FixedReplyEnabled === 1}
                        onChange={handleSwitch("FixedReplyEnabled")}
                        color="primary"
                        disabled={form.IsEnabled !== 1}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">Enable Fixed Message</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Send a predefined message instantly when a message arrives.
                        </Typography>
                      </Box>
                    }
                  />

                  {/* 3. Always Send Fixed Message */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.AlwaysSendFixedMessage === 1}
                        onChange={handleSwitch("AlwaysSendFixedMessage")}
                        color="primary"
                        disabled={form.IsEnabled !== 1 || form.FixedReplyEnabled !== 1}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">Always Send Fixed Message First</Typography>
                        <Typography variant="body2" color="text.secondary">
                          If enabled, fixed message is always sent before the AI reply.
                        </Typography>
                      </Box>
                    }
                  />

                  {/* Fixed message textarea */}
                  {form.FixedReplyEnabled === 1 && (
                    <TextField
                      label="Fixed Reply Message"
                      multiline
                      rows={4}
                      value={form.FixedReplyText || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, FixedReplyText: e.target.value }))}
                      required
                      fullWidth
                      disabled={form.IsEnabled !== 1}
                      placeholder={DEFAULT_FIXED_TEXT}
                    />
                  )}

                  <Divider />

                  {/* 4. Enable AI Reply */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.AIReplyEnabled === 1}
                        onChange={handleSwitch("AIReplyEnabled")}
                        color="primary"
                        disabled={form.IsEnabled !== 1}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">Enable AI Reply</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Generate a smart contextual reply using Pollinations AI (free, no API key).
                          Sent 3 seconds after the fixed message.
                        </Typography>
                      </Box>
                    }
                  />

                  <Box sx={{ pt: 1 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={<SaveOutlinedIcon />}
                      disabled={saving || form.IsEnabled === undefined}
                      size="large"
                      fullWidth
                    >
                      {saving ? "Saving..." : "Save Settings"}
                    </Button>
                  </Box>
                </Stack>
              </Box>

              {/* Behavior summary */}
              <Box sx={{ mt: 3, p: 2, bgcolor: "action.hover", borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight="medium">
                  CURRENT BEHAVIOR
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {!form.IsEnabled && "❌ Auto reply is OFF. No messages will be sent."}
                  {form.IsEnabled === 1 && form.FixedReplyEnabled === 1 && form.AlwaysSendFixedMessage === 1 && form.AIReplyEnabled === 1 &&
                    "✅ Fixed message sent instantly → wait 3s → AI reply sent."}
                  {form.IsEnabled === 1 && form.FixedReplyEnabled === 1 && form.AlwaysSendFixedMessage === 1 && form.AIReplyEnabled !== 1 &&
                    "✅ Fixed message only — sent instantly."}
                  {form.IsEnabled === 1 && form.FixedReplyEnabled !== 1 && form.AIReplyEnabled === 1 &&
                    "✅ AI reply only — sent after 3 seconds."}
                  {form.IsEnabled === 1 && form.FixedReplyEnabled !== 1 && form.AIReplyEnabled !== 1 &&
                    "⚠️ Auto reply is ON but both Fixed and AI reply are disabled."}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ── History Column ── */}
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 }, flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>Auto Reply History</Typography>
                <IconButton onClick={() => fetchHistory(false)} disabled={historyLoading} size="small">
                  <RefreshOutlinedIcon />
                </IconButton>
              </Box>

              {historyLoading && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {!historyLoading && history.length === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8, flexGrow: 1, textAlign: "center" }}>
                  <InfoOutlinedIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
                  <Typography variant="body1" color="text.secondary">No replies recorded yet.</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Replies will appear here as contacts message you.
                  </Typography>
                </Box>
              )}

              {!historyLoading && history.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ flexGrow: 1, maxHeight: 560 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Phone</TableCell>
                        <TableCell>Incoming Message</TableCell>
                        <TableCell>Fixed Reply</TableCell>
                        <TableCell>AI Reply</TableCell>
                        <TableCell align="right">Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.Id} hover>
                          <TableCell sx={{ fontWeight: "medium", whiteSpace: "nowrap" }}>
                            {row.Phone}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.IncomingMessage}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row.FixedReply ? "text.primary" : "text.disabled" }}>
                            {row.FixedReply || "—"}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row.AIReply ? "success.main" : "text.disabled" }}>
                            {row.AIReply || "—"}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            {formatTime(row.CreatedOn)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice((n) => ({ ...n, open: false }))}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((n) => ({ ...n, open: false }))}>
          {notice.message}
        </Alert>
      </Snackbar>
    </>
  );
}
