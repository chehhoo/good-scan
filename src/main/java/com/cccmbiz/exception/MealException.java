package com.cccmbiz.exception;

import jakarta.ws.rs.core.Response;

public class MealException extends Exception {
    private static final long serialVersionUID = 1L;
    private final Response.Status status;

    public MealException(String message) {
        super(message);
        this.status = Response.Status.INTERNAL_SERVER_ERROR;
    }

    public MealException(String message, Response.Status status) {
        super(message);
        this.status = status != null ? status : Response.Status.INTERNAL_SERVER_ERROR;
    }

    public MealException(String message, Throwable cause) {
        super(message, cause);
        this.status = Response.Status.INTERNAL_SERVER_ERROR;
    }

    public Response.Status getStatus() {
        return status;
    }
}
