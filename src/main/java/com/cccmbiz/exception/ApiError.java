package com.cccmbiz.exception;

import java.time.Instant;

public class ApiError {
    private final int status;
    private final String message;
    private final String timestamp;

    public ApiError(int status, String message) {
        this.status = status;
        this.message = message;
        this.timestamp = Instant.now().toString();
    }

    public int getStatus() { return status; }
    public String getMessage() { return message; }
    public String getTimestamp() { return timestamp; }
}
