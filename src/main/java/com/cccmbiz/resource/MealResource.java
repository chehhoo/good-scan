package com.cccmbiz.resource;

import com.cccmbiz.domain.Church;
import com.cccmbiz.domain.MealPlanView;
import com.cccmbiz.dto.*;
import com.cccmbiz.exception.MealException;
import com.cccmbiz.repository.ChurchRepository;
import com.cccmbiz.service.MealService;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

@Path("/meal")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Conference Meal Service", description = "Operations for scanning nametags to pick up meals")
public class MealResource {

    private static final Logger logger = Logger.getLogger(MealResource.class);

    @Inject ChurchRepository churchRepository;
    @Inject MealService mealService;

    @GET
    @Path("/churches")
    @Operation(summary = "List all churches")
    @APIResponse(responseCode = "200", description = "OK")
    public List<Church> churchList() {
        return churchRepository.listAll();
    }

    @GET
    @Path("/venues")
    @Operation(summary = "List all meal venues", description = "Returns available venue options for scan station selection")
    @APIResponse(responseCode = "200", description = "OK")
    public Response venues() {
        return Response.ok(List.of(
                Map.of("id", 1, "name", "Westin"),
                Map.of("id", 2, "name", "Hilton")
        )).build();
    }

    @GET
    @Path("/mealplan")
    @Operation(summary = "Retrieve meal plans")
    @APIResponse(responseCode = "200", description = "OK")
    @APIResponse(responseCode = "204", description = "No meal plans found")
    public Response listMealPlan(@QueryParam("householdId") Integer householdId) {
        List<MealPlanView> list = householdId == null
                ? mealService.listAllMealPlan()
                : mealService.findMealPlanByHouseholdId(householdId);

        return list.isEmpty()
                ? Response.noContent().build()
                : Response.ok(list).build();
    }

    @GET
    @Path("/status/{uid}")
    @Operation(summary = "Get meal status by UID")
    @APIResponse(responseCode = "200", description = "OK")
    @APIResponse(responseCode = "404", description = "Not found")
    public Response searchMealByUid(@PathParam("uid") String uid) {
        try {
            MealStatusResponseDTO response = new MealStatusResponseDTO();
            response.setMealPlans(mealService.retrieveAllMealPlanDetails(uid));
            response.setHouseholdId(mealService.getHouseholdIdByUniqueId(uid));
            return Response.ok(response).build();
        } catch (MealException e) {
            throw new WebApplicationException(e.getMessage(), e.getStatus().getStatusCode());
        }
    }

    @POST
    @Path("/status")
    @Operation(summary = "Search meal status")
    @APIResponse(responseCode = "200", description = "OK")
    @APIResponse(responseCode = "400", description = "Bad request")
    @APIResponse(responseCode = "404", description = "Not found")
    public Response searchMeal(MealStatusRequestDTO request) {
        if (request.getId() == null || request.getId().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST).entity(Map.of("message", "Empty Input ID")).build();
        }

        Integer mealId = (request.getMealId() == null || request.getMealId() == 0)
                ? mealService.getMealIDByTime(LocalDateTime.now(ZoneId.of("America/Chicago")))
                : request.getMealId();

        Integer householdId = mealService.getHouseholdIdByPersonId(Integer.valueOf(request.getId()));

        MealStatusResponseDTO response = new MealStatusResponseDTO();
        response.setHouseholdId(householdId);

        if (householdId != 0) {
            MealStatusResponseMealPlansDTO plan = mealService.retrieveMealPlanDetails(householdId, mealId);
            response.setMealPlans(List.of(plan));
            return Response.ok(response).build();
        }
        return Response.status(Response.Status.NOT_FOUND).entity(response).build();
    }

    @POST
    @Path("/scan")
    @Operation(summary = "Record a meal pickup")
    @APIResponse(responseCode = "200", description = "OK")
    @APIResponse(responseCode = "404", description = "Not found")
    public Response scanMeal(MealScanRequestDTO request) {
        logger.infof("Scan: id=%s mealId=%d", request.getId(), request.getMealId());
        try {
            return Response.ok(mealService.scan(request)).build();
        } catch (MealException e) {
            throw new WebApplicationException(e.getMessage(), e.getStatus().getStatusCode());
        }
    }

    @GET
    @Path("/info/{location}")
    @Operation(summary = "Get meal info for a venue")
    @APIResponse(responseCode = "200", description = "OK")
    public Response info(@PathParam("location") Integer location) {
        MealInfoResponse response = new MealInfoResponse();
        response.setMeals(mealService.getMealInformation(location));
        return Response.ok(response).build();
    }

    @GET
    @Path("/count/{mealId}")
    @Operation(summary = "Get pickup count for a meal")
    @APIResponse(responseCode = "200", description = "OK")
    public Response count(@PathParam("mealId") Integer mealId) {
        MealCountResponse response = new MealCountResponse();
        response.setCount(mealService.getMealPickupCount(mealId));
        response.setMealId(mealId);
        return Response.ok(response).build();
    }
}
