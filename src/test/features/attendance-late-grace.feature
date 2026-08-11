Feature: Attendance late-grace window
  Students who check in during an attendance session are marked present or
  late depending on how long the session has been open. That grace period
  used to be a fixed 10 minutes regardless of the session's own length, so
  a 30-minute session could mark someone late with 20 minutes still left on
  the clock. It is now a per-session setting chosen when staff start the
  session, and it can never exceed the session's own duration.

  Scenario: Staff choose a grace window shorter than the session duration
    Given staff are starting a 30 minute attendance session
    When they set the late-grace window to 15 minutes
    Then the session is created with a 15 minute late-grace window

  Scenario: No grace window is chosen
    Given staff are starting a 30 minute attendance session
    When they do not set a late-grace window
    Then the session is created with the default 10 minute late-grace window
