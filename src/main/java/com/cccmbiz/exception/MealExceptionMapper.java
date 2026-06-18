package com.cccmbiz.exception;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class MealExceptionMapper implements ExceptionMapper<MealException> {

    @Override
    public Response toResponse(MealException e) {
        return Response.status(e.getStatus())
                .type(MediaType.APPLICATION_JSON)
                .entity(new ApiError(e.getStatus().getStatusCode(), e.getMessage()))
                .build();
    }
}
