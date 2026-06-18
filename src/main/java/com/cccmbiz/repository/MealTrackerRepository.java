package com.cccmbiz.repository;

import com.cccmbiz.domain.MealTracker;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class MealTrackerRepository implements PanacheRepository<MealTracker> {

    public List<MealTracker> findByRegisterIdAndMealId(Integer registerId, Integer mealId) {
        return list("registerId = ?1 and mealId = ?2", registerId, mealId);
    }

    public List<MealTracker> findByHouseholdIdAndMealId(Integer householdId, Integer mealId) {
        return list("householdId = ?1 and mealId = ?2", householdId, mealId);
    }

    public long countByMealId(Integer mealId) {
        return count("mealId", mealId);
    }
}
