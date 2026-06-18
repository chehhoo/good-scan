package com.cccmbiz.service;

import com.cccmbiz.domain.*;
import com.cccmbiz.dto.*;
import com.cccmbiz.exception.MealException;
import com.cccmbiz.repository.*;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.*;

@ApplicationScoped
public class MealServiceImpl implements MealService {

    private static final Logger logger = Logger.getLogger(MealServiceImpl.class);

    @Inject MealPlanRepository mealPlanRepository;
    @Inject ProfileRepository profileRepository;
    @Inject MealTrackerRepository mealTrackerRepository;
    @Inject MealRepository mealRepository;
    @Inject RegisterMealRepository registerMealRepository;
    @Inject RegisterRepository registerRepository;
    @Inject RegisterProfileRepository registerProfileRepository;

    @ConfigProperty(name = "meal.timezone", defaultValue = "America/Chicago")
    String mealTimezone;

    @Override
    public List<Meal> getMealInformation(Integer location) {
        return mealRepository.findByLocation(location.byteValue());
    }

    @Override
    public Long getMealPickupCount(Integer mealId) {
        return mealTrackerRepository.countByMealId(mealId);
    }

    @Override
    public Integer getHouseholdIdByPersonId(Integer id) {
        Profile p = profileRepository.findByIdOptional((long) id).orElse(null);
        return p != null ? p.getHouseholdId() : 0;
    }

    @Override
    public Integer getHouseholdIdByUniqueId(String uid) {
        Profile p = profileRepository.findByUid(uid);
        return p != null ? p.getHouseholdId() : 0;
    }

    @Override
    public List<MealPlanView> listAllMealPlan() {
        return mealPlanRepository.findAllMealPlan();
    }

    @Override
    public List<MealPlanView> findMealPlanByHouseholdId(Integer householdId) {
        return mealPlanRepository.findMealPlanByHouseholdId(householdId);
    }

    @Override
    @Transactional
    public MealScanResponseDTO scan(MealScanRequestDTO request) throws MealException {
        if (request == null || request.getId() == null) {
            throw new MealException("Invalid scan request", Response.Status.BAD_REQUEST);
        }

        MealScanResponseDTO response = new MealScanResponseDTO();
        response.setMealOrdered(0);
        response.setMealTaken(0);
        response.setMealRemaining(0);
        response.setMealStatus(0);

        Integer mealId = Optional.ofNullable(request.getMealId())
                .orElse(getMealIDByTime(LocalDateTime.now(ZoneId.of(mealTimezone))));
        response.setMealId(mealId);

        if (mealId == 0) return response;

        Profile person = profileRepository.findByUid(request.getId());
        if (person == null) {
            throw new MealException("Scanned ID " + request.getId() + " Not Found", Response.Status.NOT_FOUND);
        }

        Register register = getRegisterByPersonId(person.getId());

        Meal meal = mealRepository.findByIdOptional((long) mealId)
                .orElseThrow(() -> new MealException("Meal not found", Response.Status.NOT_FOUND));

        RegisterMeal registerMeal = registerMealRepository.findByRegisterAndMeal(register, meal);
        if (registerMeal == null) {
            throw new MealException("No meal order information for register/meal", Response.Status.NOT_FOUND);
        }

        int mealTotal = Byte.toUnsignedInt(registerMeal.getQty());

        logger.debugf("scan: mealId=%d registerId=%d householdId=%d qty=%d",
                meal.getId(), register.getId(), register.getHouseholdId(), mealTotal);

        List<MealTracker> mealTrackers = Optional.ofNullable(
                        mealTrackerRepository.findByRegisterIdAndMealId(register.getId(), mealId))
                .orElseGet(Collections::emptyList);

        int taken = mealTrackers.size();

        if (mealTotal > taken) {
            MealTracker mt = createMealTracker(person, register, mealId, Byte.toUnsignedInt(meal.getLocation()));
            try {
                mealTrackerRepository.persist(mt);
                mealTrackers = new ArrayList<>(mealTrackers);
                mealTrackers.add(mt);
                taken++;
            } catch (PersistenceException ex) {
                throw new MealException("Failed to record pickup", Response.Status.INTERNAL_SERVER_ERROR);
            }
        } else {
            logger.infof("Exceed order count: registerId=%d mealId=%d", register.getId(), mealId);
            response.setMealStatus(1);
        }

        response.setMealOrdered(mealTotal);
        response.setMealTaken(taken);
        response.setMealRemaining(Math.max(0, mealTotal - taken));
        response.setPickUpRecord(convertToPickUpRecords(mealTrackers));
        response.setHouseholdId(person.getHouseholdId());

        List<RegisterMeal> registerMealList = registerMealRepository.findByRegister(register);
        List<MealStatusResponseMealPlansDTO> mealPlanList = new ArrayList<>();
        for (RegisterMeal regMeal : registerMealList) {
            mealPlanList.add(createMealPlan(regMeal));
        }
        response.setMealPlans(mealPlanList);
        response.setMealCount((int) mealTrackerRepository.countByMealId(mealId));

        return response;
    }

    @Override
    public List<MealStatusResponseMealPlansDTO> retrieveAllMealPlanDetails(String uid) throws MealException {
        Profile person = profileRepository.findByUid(uid);
        if (person == null) {
            throw new MealException("Scanned ID " + uid + " Not Found", Response.Status.NOT_FOUND);
        }
        Register register = getRegisterByPersonId(person.getId());
        List<RegisterMeal> registerMealList = registerMealRepository.findByRegister(register);
        List<MealStatusResponseMealPlansDTO> result = new ArrayList<>();
        for (RegisterMeal rm : registerMealList) {
            result.add(createMealPlan(rm));
        }
        return result;
    }

    @Override
    public MealStatusResponseMealPlansDTO retrieveMealPlanDetails(Integer householdId, Integer mealId) {
        MealStatusResponseMealPlansDTO mealStatus = new MealStatusResponseMealPlansDTO();
        mealStatus.setMealId(mealId);

        Optional<Meal> optionalMeal = mealRepository.findByIdOptional((long) mealId);
        Register register = registerRepository.findByHouseholdId(householdId);

        if (optionalMeal.isPresent() && register != null) {
            Meal meal = optionalMeal.get();
            mealStatus.setDescription(meal.getName() + " on " + meal.getDate() + " " + meal.getStartTime() + " $" + meal.getPrice());
            mealStatus.setLocationId((int) meal.getLocation());
            RegisterMeal registerMeal = registerMealRepository.findByRegisterAndMeal(register, meal);
            if (registerMeal != null) {
                mealStatus.setMealOrdered((int) registerMeal.getQty());
                List<MealScanResponsePickUpRecordDTO> pickupRecords = retrievePickupRecord(householdId, mealId);
                mealStatus.setMealTaken(pickupRecords.size());
                mealStatus.setMealRemaining(mealStatus.getMealOrdered() - mealStatus.getMealTaken());
                mealStatus.setPickUpRecord(pickupRecords);
            }
        }
        return mealStatus;
    }

    @Override
    public List<MealScanResponsePickUpRecordDTO> retrievePickupRecordByRegisterId(Integer registerId, Integer mealId) {
        return convertToPickUpRecords(mealTrackerRepository.findByRegisterIdAndMealId(registerId, mealId));
    }

    @Override
    public List<MealScanResponsePickUpRecordDTO> retrievePickupRecord(Integer householdId, Integer mealId) {
        return convertToPickUpRecords(mealTrackerRepository.findByHouseholdIdAndMealId(householdId, mealId));
    }

    @Override
    public Integer getMealIDByTime(LocalDateTime mealTime) {
        return mealRepository.findByLocation((byte) 1).stream()
                .filter(meal -> {
                    LocalDate d = meal.getDate().toLocalDate();
                    LocalDateTime start = d.atTime(meal.getStartTime().toLocalTime());
                    LocalDateTime end = d.atTime(meal.getEndTime().toLocalTime());
                    return !mealTime.isBefore(start) && mealTime.isBefore(end);
                })
                .map(Meal::getId)
                .findFirst()
                .orElse(0);
    }

    private Register getRegisterByPersonId(Integer personId) throws MealException {
        RegisterProfileResult rp = registerProfileRepository.getRegisterProfile(personId);
        if (rp == null) {
            throw new MealException("Registration ID for " + personId + " Not Found", Response.Status.NOT_FOUND);
        }
        return registerRepository.findByIdOptional((long) rp.registerId())
                .orElseThrow(() -> new MealException("Register not found", Response.Status.NOT_FOUND));
    }

    private MealTracker createMealTracker(Profile person, Register register, Integer mealId, Integer locationId) {
        MealTracker mt = new MealTracker();
        mt.setPersonId(person.getId());
        mt.setUid(person.getUid());
        mt.setHouseholdId(person.getHouseholdId());
        mt.setRegisterId(register.getId());
        mt.setMealId(mealId);
        mt.setLastModified(new Timestamp(System.currentTimeMillis()));
        mt.setRemark(constructFullName(person));
        mt.setLocationId(locationId);
        return mt;
    }

    private List<MealScanResponsePickUpRecordDTO> convertToPickUpRecords(List<MealTracker> trackers) {
        List<MealScanResponsePickUpRecordDTO> records = new ArrayList<>();
        for (MealTracker t : trackers) {
            MealScanResponsePickUpRecordDTO r = new MealScanResponsePickUpRecordDTO();
            r.setPersonId(t.getPersonId());
            r.setPickUpDate(t.getLastModified() != null ? t.getLastModified().toInstant().toString() : null);
            r.setName(t.getRemark());
            r.setLocationId(t.getLocationId());
            records.add(r);
        }
        return records;
    }

    private MealStatusResponseMealPlansDTO createMealPlan(RegisterMeal registerMeal) {
        MealStatusResponseMealPlansDTO plan = new MealStatusResponseMealPlansDTO();
        plan.setMealId(registerMeal.getMealByMealId().getId());
        plan.setMealOrdered((int) registerMeal.getQty());
        List<MealScanResponsePickUpRecordDTO> pickupRecords =
                retrievePickupRecordByRegisterId(registerMeal.getRegisterByRegisterId().getId(), registerMeal.getMealByMealId().getId());
        plan.setMealTaken(pickupRecords.size());
        plan.setMealRemaining(plan.getMealOrdered() - plan.getMealTaken());
        plan.setPickUpRecord(pickupRecords);

        mealRepository.findByIdOptional((long) registerMeal.getMealByMealId().getId()).ifPresent(meal -> {
            String type = switch (meal.getType()) {
                case 1 -> "BREAKFAST";
                case 2 -> "LUNCH";
                case 3 -> "DINNER";
                default -> "UNKNOWN";
            };
            plan.setDescription(type + " ON " + meal.getDate() + " AT " + meal.getStartTime());
            plan.setLocationId((int) meal.getLocation());
        });
        return plan;
    }

    private String constructFullName(Profile person) {
        StringBuilder name = new StringBuilder();
        if (person.getCnName() != null && !person.getCnName().isEmpty()) name.append(person.getCnName());
        if (person.getFirstName() != null && !person.getFirstName().isEmpty()) {
            if (name.length() > 0) name.append(" ");
            name.append(person.getFirstName());
        }
        if (person.getLastName() != null && !person.getLastName().isEmpty()) {
            if (name.length() > 0) name.append(" ");
            name.append(person.getLastName());
        }
        return name.toString();
    }
}
